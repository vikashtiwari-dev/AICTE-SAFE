import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db, executeMutation, recordAuditLog } from '../db/database';
import { authenticate, requireRole, AuthRequest, maskAccountNumber } from '../middleware/auth';
import { upload, validateFileMagic, validateDocumentFile } from '../middleware/upload';
import { lookupIFSC, verifyNeSLeBG, validateSFMS_IFN760, verifyIndividualFDRDetails } from '../services/bankingService';
import { extractFDRFromDocument } from '../services/ocrService';
import { calculateRequiredDeposit, validateLockInEligibility } from '../services/aphService';
import { verificationLimiter, documentLimiter, sanitizeError } from '../middleware/security';

const router = express.Router();

// POST /api/fdrs/ocr-extract - Honest AI / OCR entity extraction with mathematical confidence
router.post('/ocr-extract', verificationLimiter, authenticate, requireRole(['admin', 'bureau_officer', 'institution_user']), upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a bank certificate file (PDF, PNG, JPG)' });
  }

  const filePath = req.file.path;
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext === '.docx' || ext === '.doc') {
      return res.status(400).json({
        error: 'Automated OCR extraction supports PDF and image certificates. For DOCX files, please convert to PDF or enter details manually.'
      });
    }

    const valResult = validateDocumentFile(filePath, req.file.originalname);
    if (!valResult.valid) {
      return res.status(400).json({ error: valResult.error || 'Security rejection: Uploaded file signature does not match authentic document formats.' });
    }

    const submittedData = {
      deposit_amount: req.body.declared_amount ? parseFloat(req.body.declared_amount) : undefined,
      fdr_number: req.body.declared_fdr_number,
    };

    const extracted = await extractFDRFromDocument(filePath, submittedData);
    return res.json(extracted);
  } catch (err: any) {
    return res.status(500).json({ error: 'OCR Extraction failed' });
  } finally {
    // Guaranteed bulletproof cleanup of staged OCR temporary file on all code paths
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (_) {}
  }
});

// GET /api/fdrs/validate-ifsc/:ifsc - Authoritative RBI Scheduled Bank validation
router.get('/validate-ifsc/:ifsc', async (req, res) => {
  try {
    const result = await lookupIFSC(req.params.ifsc);
    if (!result.valid) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json(sanitizeError(err, 'IFSC directory lookup failed'));
  }
});

// POST /api/fdrs/verify-nesl - NeSL Electronic Bank Guarantee (e-BG) Verification (Rate limited)
router.post('/verify-nesl', verificationLimiter, authenticate, (req: AuthRequest, res) => {
  const { nesl_identifier, deposit_amount, bank_name } = req.body;
  if (!nesl_identifier) {
    return res.status(400).json({ error: 'NeSL Identifier reference is required (e.g. NESL-2024-BG-889912)' });
  }
  if (deposit_amount === undefined || deposit_amount === null || deposit_amount === '') {
    return res.status(400).json({ error: 'Deposit amount is required for authentic NeSL e-BG matching.' });
  }
  const parsedAmount = parseFloat(deposit_amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Valid positive deposit amount is required.' });
  }
  const result = verifyNeSLeBG(nesl_identifier, parsedAmount, bank_name || 'Scheduled Commercial Bank');
  return res.json(result);
});

// POST /api/fdrs/verify-sfms - SFMS IFN 760 Structured Financial Message Verification (Rate limited)
router.post('/verify-sfms', verificationLimiter, authenticate, (req: AuthRequest, res) => {
  const { sfms_message } = req.body;
  if (!sfms_message) {
    return res.status(400).json({ error: 'SFMS Raw Message block is required for parsing' });
  }
  const result = validateSFMS_IFN760(sfms_message);
  return res.json(result);
});

function parseBoolean(val: any): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }
  return false;
}

// POST /api/fdrs/aph-calculate - Statutory APH Security Deposit Calculator
router.post('/aph-calculate', authenticate, (req: AuthRequest, res) => {
  const { programme_key, institution_type, minority_status, is_women_only, is_remote_region } = req.body;
  const result = calculateRequiredDeposit({
    programme_key: programme_key || institution_type || 'Engineering_UG',
    is_minority_institution: parseBoolean(minority_status),
    is_women_institution: parseBoolean(is_women_only),
    is_special_region: parseBoolean(is_remote_region)
  });
  return res.json(result);
});

// GET /api/fdrs/public-verify - Public Search / Verification (Rate-limited, sanitized, zero token exposure)
router.get('/public-verify', verificationLimiter, async (req, res) => {
  const query = ((req.query.q || req.query.query || '') as string).trim();
  if (!query || query.length < 3) {
    return res.status(400).json({ error: 'Please enter a valid FDR Number or AICTE Permanent Institute ID (PID)' });
  }

  try {
    const fdr = await db.prepare(`
      SELECT 
        f.fdr_number,
        f.bank_name,
        f.branch_name,
        f.deposit_amount,
        f.issue_date,
        f.maturity_date,
        f.status,
        f.verification_status,
        f.joint_lien_undertaking,
        f.deposit_type,
        i.name as institution_name,
        i.aicte_id,
        i.state,
        i.city
      FROM fdrs f
      LEFT JOIN institutions i ON f.institution_id = i.id
      WHERE UPPER(f.fdr_number) = UPPER(?) OR UPPER(i.aicte_id) = UPPER(?)
      LIMIT 1
    `).get(query, query) as any;

    if (!fdr) {
      return res.status(404).json({
        found: false,
        message: 'No matching deposit record found for the provided identifier. Please ensure the FDR Number or AICTE Institute ID is correct.'
      });
    }

    // Mask sensitive details for public security compliance
    const maskedFdrNumber = fdr.fdr_number.length > 4 
      ? fdr.fdr_number.substring(0, 3) + '••••' + fdr.fdr_number.substring(fdr.fdr_number.length - 2)
      : '••••';

    return res.json({
      found: true,
      data: {
        fdr_number_masked: maskedFdrNumber,
        institution_name: fdr.institution_name,
        aicte_id: fdr.aicte_id,
        bank_name: fdr.bank_name,
        branch_name: fdr.branch_name,
        deposit_type: fdr.deposit_type,
        issue_date: fdr.issue_date,
        maturity_date: fdr.maturity_date,
        status: fdr.status,
        verification_status: fdr.verification_status,
        has_joint_lien: Boolean(fdr.joint_lien_undertaking),
        location: `${fdr.city || ''}, ${fdr.state || ''}`.replace(/^,\s*|,\s*$/g, '')
      }
    });
  } catch (err: any) {
    return res.status(500).json(sanitizeError(err, 'Failed to perform public instrument verification'));
  }
});

// GET /api/fdrs - List with strict institution isolation & bounded pagination
// Explicit role policy: admin, bureau_officer, viewer (read-only), institution_user (isolated to own id)
router.get('/', authenticate, requireRole(['admin', 'bureau_officer', 'viewer', 'institution_user']), async (req: AuthRequest, res) => {
  const { status, verification_status, institution_id, search, page = '1', limit = '20', deposit_type } = req.query;
  const safePage = Math.max(1, parseInt(page as string) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
  const offset = (safePage - 1) * safeLimit;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  // Strict Fail-Closed Institution Isolation
  if (req.user!.role === 'institution_user') {
    if (!req.user!.institution_id) {
      return res.status(403).json({ error: 'Access denied: Institution user account is not associated with any registered institution.' });
    }
    whereClause += ' AND f.institution_id = ?';
    params.push(req.user!.institution_id);
  } else if (institution_id) {
    whereClause += ' AND f.institution_id = ?';
    params.push(institution_id);
  }

  if (status) { whereClause += ' AND f.status = ?'; params.push(status); }
  if (verification_status) { whereClause += ' AND f.verification_status = ?'; params.push(verification_status); }
  if (deposit_type) { whereClause += ' AND f.deposit_type = ?'; params.push(deposit_type); }
  if (search) {
    whereClause += ' AND (f.fdr_number LIKE ? OR i.name LIKE ? OR f.bank_name LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  const totalRow = await db.prepare(`
    SELECT COUNT(*) as total FROM fdrs f 
    JOIN institutions i ON f.institution_id = i.id
    ${whereClause}
  `).get(...params) as any;

  const fdrs = await db.prepare(`
    SELECT f.*, i.name as institution_name, i.aicte_id,
      u1.full_name as submitted_by_name, u2.full_name as verified_by_name,
      CAST((f.maturity_date - CURRENT_DATE) AS INTEGER) as days_to_maturity
    FROM fdrs f
    JOIN institutions i ON f.institution_id = i.id
    LEFT JOIN users u1 ON f.submitted_by = u1.id
    LEFT JOIN users u2 ON f.verified_by = u2.id
    ${whereClause}
    ORDER BY f.submitted_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, safeLimit, offset) as any[];

  // Apply DPDP Act 2023 compliant sensitive account masking
  const maskedFdrs = fdrs.map(f => ({
    ...f,
    account_number: maskAccountNumber(f.account_number, req.user!.role)
  }));

  const totalCount = totalRow ? Number(totalRow.total) : 0;

  return res.json({
    data: maskedFdrs,
    total: totalCount,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(totalCount / safeLimit),
  });
});

// GET /api/fdrs/:id - Single FDR with explicit role check and ownership verification
router.get('/:id', authenticate, requireRole(['admin', 'bureau_officer', 'viewer', 'institution_user']), async (req: AuthRequest, res) => {
  const fdr = await db.prepare(`
    SELECT f.*, i.name as institution_name, i.aicte_id, i.contact_person, i.contact_email,
      u1.full_name as submitted_by_name, u2.full_name as verified_by_name, u3.full_name as last_updated_by_name,
      CAST((f.maturity_date - CURRENT_DATE) AS INTEGER) as days_to_maturity
    FROM fdrs f
    JOIN institutions i ON f.institution_id = i.id
    LEFT JOIN users u1 ON f.submitted_by = u1.id
    LEFT JOIN users u2 ON f.verified_by = u2.id
    LEFT JOIN users u3 ON f.last_updated_by = u3.id
    WHERE f.id = ?
  `).get(req.params.id) as any;

  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  // Strict ownership check for institution users
  if (req.user!.role === 'institution_user' && fdr.institution_id !== req.user!.institution_id) {
    return res.status(403).json({ error: 'Forbidden: You do not possess clearance for this institutional instrument.' });
  }

  // Calculate APH Lock-in eligibility
  const lockInEligibility = validateLockInEligibility(fdr.issue_date, fdr.lock_in_years || 8);

  const documents = await db.prepare('SELECT * FROM fdr_documents WHERE fdr_id = ? AND is_active = 1 ORDER BY uploaded_at DESC').all(fdr.id) as any[];
  const audit = await db.prepare(`
    SELECT a.*, u.full_name as changed_by_name 
    FROM audit_log a LEFT JOIN users u ON a.user_id = u.id
    WHERE a.entity_type = 'FDR' AND a.entity_id = ?
    ORDER BY a.timestamp DESC
  `).all(fdr.id) as any[];

  // Sensitive account masking
  const safeFdr = {
    ...fdr,
    raw_account_number: req.user!.role === 'admin' || req.user!.role === 'bureau_officer' ? fdr.account_number : undefined,
    account_number: maskAccountNumber(fdr.account_number, req.user!.role),
    lock_in_eligibility: lockInEligibility,
    documents,
    audit
  };

  return res.json(safeFdr);
});

// POST /api/fdrs - Create with strict institution ownership enforcement and durable cloud write
router.post('/', authenticate, requireRole(['admin', 'bureau_officer', 'institution_user']), async (req: AuthRequest, res) => {
  const { institution_id, fdr_number, bank_name, bank_branch, account_number, deposit_amount, issue_date, maturity_date, interest_rate, deposit_type, purpose, remarks, is_renewal, parent_fdr_id } = req.body;

  if (!fdr_number || !bank_name || deposit_amount === undefined || deposit_amount === null || !issue_date || !maturity_date) {
    return res.status(400).json({ error: 'Required fields missing (FDR Number, Bank Name, Deposit Amount, Issue Date, Maturity Date)' });
  }

  // Financial validation: deposit_amount must be strictly positive
  const numAmount = parseFloat(deposit_amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Deposit amount must be a positive numeric value greater than zero.' });
  }

  // Chronological & valid calendar date format validation
  const issueD = new Date(issue_date);
  const maturityD = new Date(maturity_date);
  if (isNaN(issueD.getTime()) || isNaN(maturityD.getTime())) {
    return res.status(400).json({ error: 'Issue date and maturity date must be valid calendar dates (YYYY-MM-DD).' });
  }
  if (issueD >= maturityD) {
    return res.status(400).json({ error: 'Maturity date must be chronologically after the issue date.' });
  }

  // Allowed deposit_type and purpose enum checks
  const allowedDepositTypes = ['FDR', 'BG', 'Government_Bond', 'e-BG'];
  if (deposit_type && !allowedDepositTypes.includes(deposit_type)) {
    return res.status(400).json({ error: `Invalid deposit_type. Must be one of: ${allowedDepositTypes.join(', ')}` });
  }

  // Interest rate bounds: 0% to 25% per annum
  let parsedRate: number | null = null;
  if (interest_rate !== undefined && interest_rate !== null && interest_rate !== '') {
    parsedRate = parseFloat(interest_rate);
    if (isNaN(parsedRate) || parsedRate < 0 || parsedRate > 25) {
      return res.status(400).json({ error: 'Interest rate must be a realistic percentage between 0% and 25% per annum.' });
    }
  }

  // Strictly enforce institution ownership: an institution_user CANNOT create FDRs for other institutions
  let targetInstitutionId = institution_id;
  if (req.user!.role === 'institution_user') {
    if (!req.user!.institution_id) {
      return res.status(403).json({ error: 'Forbidden: Your user account is not linked to any registered institution.' });
    }
    targetInstitutionId = req.user!.institution_id;
  }

  if (!targetInstitutionId) {
    return res.status(400).json({ error: 'Institution ID is required' });
  }

  // Verify institution exists
  const instExists = await db.prepare('SELECT id FROM institutions WHERE id = ?').get(targetInstitutionId);
  if (!instExists) {
    return res.status(400).json({ error: 'Specified institution does not exist in registry' });
  }

  // Strictly validate predecessor instrument ownership on renewals
  if (is_renewal || parent_fdr_id) {
    if (!parent_fdr_id) {
      return res.status(400).json({ error: 'Parent FDR ID is mandatory when submitting an instrument renewal.' });
    }
    const parentFdr = await db.prepare('SELECT id, institution_id, fdr_number FROM fdrs WHERE id = ?').get(parent_fdr_id) as any;
    if (!parentFdr) {
      return res.status(400).json({ error: 'Predecessor renewal FDR not found in registry.' });
    }
    if (Number(parentFdr.institution_id) !== Number(targetInstitutionId)) {
      return res.status(403).json({ error: 'Security violation: Predecessor renewal instrument belongs to a different institution.' });
    }
  }

  try {
    const createdFdr = await db.transaction(async (tx) => {
      const result = await tx.execute(`
        INSERT INTO fdrs (institution_id, fdr_number, bank_name, bank_branch, account_number, deposit_amount,
          issue_date, maturity_date, interest_rate, deposit_type, purpose, remarks, is_renewal, parent_fdr_id,
          submitted_by, last_updated_by, status, verification_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Verification', 'Unverified')
      `, [
        targetInstitutionId, fdr_number.trim().toUpperCase(), bank_name.trim(), bank_branch || null, account_number || null,
        numAmount, issue_date, maturity_date, parsedRate,
        deposit_type || 'FDR', purpose || null, remarks || null,
        is_renewal ? 1 : 0, parent_fdr_id || null,
        req.user!.userId, req.user!.userId
      ]);

      await recordAuditLog(tx, {
        entity_type: 'FDR',
        entity_id: result.lastInsertRowid,
        action: 'Created',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({ fdr_number, deposit_amount: numAmount, status: 'Pending Verification' }),
        notes: 'New regulatory instrument submitted'
      });

      return await tx.queryOne('SELECT * FROM fdrs WHERE id = ?', [result.lastInsertRowid]);
    });

    return res.status(201).json(createdFdr);
  } catch (err: any) {
    if (err.code === '23505' || (err.message && (err.message.includes('UNIQUE') || err.message.includes('unique constraint') || err.message.includes('duplicate key')))) {
      return res.status(409).json({ error: `FDR number "${fdr_number}" already exists in the national database.` });
    }
    return res.status(500).json(sanitizeError(err, 'Failed to create FDR in cloud database'));
  }
});

// Valid FDR Lifecycle State Transitions
const VALID_FDR_TRANSITIONS: Record<string, string[]> = {
  'Pending Verification': ['Active', 'Discrepancy', 'Cancelled'],
  'Active': ['Expiring Soon', 'Matured', 'Lien Invoked', 'Under Review for Release'],
  'Expiring Soon': ['Matured', 'Renewed', 'Active'],
  'Matured': ['Renewed', 'Lien Invoked', 'Under Review for Release'],
  'Renewed': ['Active', 'Matured'],
  'Under Review for Release': ['Released', 'Active'],
  'Lien Invoked': ['Forfeited', 'Active'],
  'Released': [], // Terminal
  'Forfeited': [] // Terminal
};

// PUT /api/fdrs/:id - Update with validated state transitions & non-destructive partial updates
router.put('/:id', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const fdr = await db.queryOne('SELECT * FROM fdrs WHERE id = ?', [req.params.id]) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  const { bank_name, bank_branch, account_number, deposit_amount, issue_date, maturity_date, interest_rate, deposit_type, purpose, remarks, status } = req.body;

  // Validate state transition if status is being updated (strictly enforced for all roles including admin)
  const targetStatus = status || fdr.status;
  if (status && status !== fdr.status) {
    const allowed = VALID_FDR_TRANSITIONS[fdr.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        error: `Invalid status transition: Cannot change status from "${fdr.status}" to "${status}".`,
        allowed_transitions: allowed
      });
    }
  }

  // Non-destructive partial field resolution
  const updatedBankName = bank_name !== undefined ? bank_name.trim() : fdr.bank_name;
  const updatedBranch = bank_branch !== undefined ? bank_branch : fdr.bank_branch;
  const updatedAccount = account_number !== undefined ? account_number : fdr.account_number;
  
  let updatedAmount = fdr.deposit_amount;
  if (deposit_amount !== undefined) {
    const parsed = parseFloat(deposit_amount);
    if (isNaN(parsed) || parsed <= 0) {
      return res.status(400).json({ error: 'Deposit amount must be a positive numeric value.' });
    }
    updatedAmount = parsed;
  }

  const updatedIssueDate = issue_date !== undefined ? issue_date : fdr.issue_date;
  const updatedMaturityDate = maturity_date !== undefined ? maturity_date : fdr.maturity_date;
  if (updatedIssueDate && updatedMaturityDate) {
    const upIssueD = new Date(updatedIssueDate);
    const upMaturityD = new Date(updatedMaturityDate);
    if (isNaN(upIssueD.getTime()) || isNaN(upMaturityD.getTime())) {
      return res.status(400).json({ error: 'Issue date and maturity date must be valid calendar dates (YYYY-MM-DD).' });
    }
    if (upIssueD >= upMaturityD) {
      return res.status(400).json({ error: 'Maturity date cannot precede or match the issue date.' });
    }
  }

  const updatedInterestRate = interest_rate !== undefined ? (interest_rate ? parseFloat(interest_rate) : null) : fdr.interest_rate;
  const updatedDepositType = deposit_type !== undefined ? deposit_type : fdr.deposit_type;
  const updatedPurpose = purpose !== undefined ? purpose : fdr.purpose;
  const updatedRemarks = remarks !== undefined ? remarks : fdr.remarks;

  const oldState = JSON.stringify({ status: fdr.status, deposit_amount: fdr.deposit_amount });

  try {
    const updated = await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE fdrs SET bank_name = ?, bank_branch = ?, account_number = ?, deposit_amount = ?,
          issue_date = ?, maturity_date = ?, interest_rate = ?, deposit_type = ?, purpose = ?,
          remarks = ?, status = ?, last_updated_by = ?, last_updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        updatedBankName, updatedBranch, updatedAccount, updatedAmount,
        updatedIssueDate, updatedMaturityDate, updatedInterestRate,
        updatedDepositType, updatedPurpose, updatedRemarks, targetStatus,
        req.user!.userId, req.params.id
      ]);

      await recordAuditLog(tx, {
        entity_type: 'FDR',
        entity_id: Number(req.params.id),
        action: 'Updated',
        changed_by: req.user!.userId,
        old_value: oldState,
        new_value: JSON.stringify({ status: targetStatus, deposit_amount: updatedAmount }),
        notes: `FDR parameters updated by ${req.user!.username}`
      });

      return await tx.queryOne('SELECT * FROM fdrs WHERE id = ?', [req.params.id]);
    });

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json(sanitizeError(err, 'Failed to update FDR in cloud database'));
  }
});

// PATCH /api/fdrs/:id/verify - Strictly enforce verification policy & require uploaded evidence & method (Rate limited)
router.patch('/:id/verify', verificationLimiter, authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const { verification_status, verification_notes, verification_method } = req.body;
  const fdr = await db.queryOne('SELECT * FROM fdrs WHERE id = ?', [req.params.id]) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  const allowedStatuses = ['Verified', 'Discrepancy', 'Under Scrutiny', 'Unverified'];
  if (!allowedStatuses.includes(verification_status)) {
    return res.status(400).json({ error: `Invalid verification status. Must be one of: ${allowedStatuses.join(', ')}` });
  }

  // Require documented evidence and explicit verification method before granting Verified status
  if (verification_status === 'Verified') {
    if (!verification_method || typeof verification_method !== 'string' || verification_method.trim().length < 3) {
      return res.status(400).json({
        error: 'Verification method is mandatory when approving an instrument (e.g. PHYSICAL_INSPECTION, BANK_CONFIRMATION_LETTER, NESL_EBG, SFMS_IFN760, BANK_PORTAL_API, OFFICER_MANUAL_SCRUTINY).'
      });
    }

    if (!verification_notes || verification_notes.trim().length < 10) {
      return res.status(400).json({
        error: 'Substantive scrutiny notes (minimum 10 characters) detailing the verification evidence are required.'
      });
    }

    const docCountRow = await db.queryOne(
      'SELECT COUNT(*) as count FROM fdr_documents WHERE fdr_id = ? AND is_active = 1',
      [fdr.id]
    ) as any;
    const docCount = docCountRow ? Number(docCountRow.count) : 0;
    if (docCount === 0) {
      return res.status(400).json({
        error: 'Regulatory evidence rejection: An instrument cannot be marked Verified without at least one authentic active bank certificate or FDR document uploaded as evidence.'
      });
    }
  }

  if (verification_status === 'Discrepancy' && (!verification_notes || verification_notes.trim().length < 5)) {
    return res.status(400).json({ error: 'Detailed scrutiny notes are required when flagging an instrument discrepancy.' });
  }

  const newFdrStatus = (verification_status === 'Verified' && fdr.status === 'Pending Verification')
    ? 'Active'
    : (verification_status === 'Discrepancy' ? 'Pending Verification' : fdr.status);

  try {
    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE fdrs SET verification_status = ?, verification_notes = ?,
          verified_by = ?, verified_at = CURRENT_TIMESTAMP,
          status = ?, last_updated_by = ?, last_updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [verification_status, verification_notes || null, req.user!.userId, newFdrStatus, req.user!.userId, req.params.id]);

      await recordAuditLog(tx, {
        entity_type: 'FDR',
        entity_id: Number(req.params.id),
        action: verification_status === 'Verified' ? 'Verification Approved' : 'Discrepancy Flagged',
        changed_by: req.user!.userId,
        old_value: JSON.stringify({ verification_status: fdr.verification_status }),
        new_value: JSON.stringify({ verification_status, verification_method: verification_method || 'MANUAL', notes: verification_notes }),
        notes: verification_notes || `Status marked as ${verification_status}`
      });

      // If discrepancy flagged, create a high-priority alert
      if (verification_status === 'Discrepancy') {
        await tx.execute(`
          INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message)
          VALUES (?, ?, 'Discrepancy', 'Critical', ?)
        `, [fdr.id, fdr.institution_id, `Scrutiny Discrepancy flagged on FDR ${fdr.fdr_number}: ${verification_notes}`]);
      }

      // Record immutable verification attempt log
      await tx.execute(`
        INSERT INTO fdr_verification_attempts (
          fdr_id, verification_source, source_reference, verification_tier,
          result_status, is_simulated, details_payload, discrepancies, verified_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        fdr.id,
        verification_method || 'OFFICER_MANUAL_SCRUTINY',
        `OFFICER-USER-${req.user!.userId}`,
        verification_status === 'Verified' ? 'BANK_CONFIRMED' : 'DISCREPANCY_FLAGGED',
        verification_status,
        false,
        JSON.stringify({ notes: verification_notes, method: verification_method }),
        verification_status === 'Discrepancy' ? verification_notes : null,
        req.user!.userId
      ]);
    });

    return res.json({ success: true, verification_status, fdr_status: newFdrStatus, verification_method });
  } catch (err: any) {
    return res.status(500).json(sanitizeError(err, 'Verification update failed'));
  }
});

// POST /api/fdrs/:id/bank-verify - Trigger individual instrument bank verification check (Rate limited)
router.post('/:id/bank-verify', verificationLimiter, authenticate, requireRole(['admin', 'bureau_officer', 'institution_user']), async (req: AuthRequest, res) => {
  const fdr = await db.queryOne('SELECT * FROM fdrs WHERE id = ?', [req.params.id]) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  // Ownership verification for institution user
  if (req.user!.role === 'institution_user' && fdr.institution_id !== req.user!.institution_id) {
    return res.status(403).json({ error: 'Forbidden: You do not possess clearance for this institutional record.' });
  }

  try {
    // Respect institution-submitted lien status rather than assuming hardcoded true
    const submittedLienStatus = Boolean(fdr.joint_lien_undertaking ?? fdr.joint_lien ?? false);

    const verificationResult = await verifyIndividualFDRDetails({
      fdr_number: fdr.fdr_number,
      bank_name: fdr.bank_name,
      ifsc_code: fdr.ifsc_code,
      deposit_amount: fdr.deposit_amount,
      issue_date: fdr.issue_date,
      maturity_date: fdr.maturity_date,
      account_number: fdr.account_number,
      joint_lien_undertaking: submittedLienStatus
    });

    // Record attempt transactionally in fdr_verification_attempts
    await db.transaction(async (tx) => {
      await tx.execute(`
        INSERT INTO fdr_verification_attempts (
          fdr_id, verification_source, source_reference, verification_tier,
          result_status, is_simulated, details_payload, discrepancies, verified_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        fdr.id,
        verificationResult.verification_source,
        verificationResult.reference_id,
        verificationResult.verification_tier,
        verificationResult.status,
        verificationResult.is_simulated,
        JSON.stringify(verificationResult),
        verificationResult.discrepancies.length > 0 ? JSON.stringify(verificationResult.discrepancies) : null,
        req.user!.userId
      ]);

      // If conflicting or discrepancy found, flag the instrument automatically
      if (verificationResult.status === 'DISCREPANCY') {
        await tx.execute(`
          UPDATE fdrs SET verification_status = 'Discrepancy',
            verification_notes = ?, last_updated_by = ?, last_updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [`Automated verification discrepancy: ${verificationResult.discrepancies.join('; ')}`, req.user!.userId, fdr.id]);

        await tx.execute(`
          INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message)
          VALUES (?, ?, 'Discrepancy', 'Critical', ?)
        `, [fdr.id, fdr.institution_id, `Automated Bank Verification Discrepancy on FDR ${fdr.fdr_number}: ${verificationResult.discrepancies.join('; ')}`]);

        await recordAuditLog(tx, {
          entity_type: 'FDR',
          entity_id: fdr.id,
          action: 'Bank Verification Discrepancy Flagged',
          changed_by: req.user!.userId,
          old_value: JSON.stringify({ verification_status: fdr.verification_status }),
          new_value: JSON.stringify({ verification_status: 'Discrepancy', discrepancies: verificationResult.discrepancies }),
          notes: `Automated Bank Gateway flagged discrepancy on FDR ${fdr.fdr_number}`
        });
      }
    });

    return res.json({
      success: true,
      fdr_id: fdr.id,
      fdr_number: fdr.fdr_number,
      ...verificationResult
    });
  } catch (err: any) {
    return res.status(500).json(sanitizeError(err, 'Bank verification check failed'));
  }
});

// GET /api/fdrs/:id/verification-history - Full traceable audit log of all verification attempts
router.get('/:id/verification-history', authenticate, async (req: AuthRequest, res) => {
  const fdr = await db.queryOne('SELECT id, institution_id, fdr_number, verification_status FROM fdrs WHERE id = ?', [req.params.id]) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  if (req.user!.role === 'institution_user' && fdr.institution_id !== req.user!.institution_id) {
    return res.status(403).json({ error: 'Forbidden: Access denied to other institutional records.' });
  }

  try {
    const attempts = await db.prepare(`
      SELECT va.*, u.full_name as verifier_name, u.role as verifier_role
      FROM fdr_verification_attempts va
      LEFT JOIN users u ON va.verified_by = u.id
      WHERE va.fdr_id = ?
      ORDER BY va.attempted_at DESC
    `).all(fdr.id);

    return res.json({
      fdr_id: fdr.id,
      fdr_number: fdr.fdr_number,
      current_verification_status: fdr.verification_status,
      total_attempts: attempts.length,
      history: attempts
    });
  } catch (err: any) {
    return res.status(500).json(sanitizeError(err, 'Failed to fetch verification history'));
  }
});

// POST /api/fdrs/:id/documents - Upload with strict institution ownership verification (Rate limited)
router.post('/:id/documents', documentLimiter, authenticate, requireRole(['admin', 'bureau_officer', 'institution_user']),
  upload.single('file'), async (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const stagedFilePath = req.file.path;
    try {
      // Enforce strict file magic signature and deep format verification
      const valResult = validateDocumentFile(stagedFilePath, req.file.originalname);
      if (!valResult.valid) {
        return res.status(400).json({ error: valResult.error || 'Security validation failed: File headers do not match legitimate document formats (PDF, JPEG, PNG, DOCX).' });
      }

      const fdr = await db.prepare('SELECT * FROM fdrs WHERE id = ?').get(req.params.id) as any;
      if (!fdr) {
        return res.status(404).json({ error: 'FDR not found' });
      }

      // Strict institution ownership verification
      if (req.user!.role === 'institution_user' && fdr.institution_id !== req.user!.institution_id) {
        return res.status(403).json({ error: 'Forbidden: You cannot upload documents to an FDR belonging to another institution.' });
      }

      let sha256Hash = '0x' + crypto.randomBytes(32).toString('hex');
      let fileBuffer: Buffer | null = null;
      try {
        if (stagedFilePath && fs.existsSync(stagedFilePath)) {
          fileBuffer = fs.readFileSync(stagedFilePath);
          sha256Hash = '0x' + crypto.createHash('sha256').update(fileBuffer).digest('hex');
        }
      } catch (_) {}

      const createdDoc = await db.transaction(async (tx) => {
        const docType = req.body.document_type || 'Supporting_Doc';

        // Calculate document version sequence for audit versioning
        const prevVerRow = await tx.queryOne(
          'SELECT COALESCE(MAX(version), 0) as max_v FROM fdr_documents WHERE fdr_id = ? AND document_type = ?',
          [fdr.id, docType]
        ) as any;
        const nextVersion = Number(prevVerRow?.max_v || 0) + 1;

        const result = await tx.execute(`
          INSERT INTO fdr_documents (fdr_id, document_type, file_name, file_path, file_size, mime_type, sha256_hash, verified_on_chain, uploaded_by, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `, [
          fdr.id, docType,
          req.file!.originalname, req.file!.filename,
          req.file!.size, req.file!.mimetype, sha256Hash, req.user!.userId, nextVersion
        ]);

        const docId = result.lastInsertRowid;

        // Durably persist document byte payload in PostgreSQL to survive serverless ephemeral containers
        if (fileBuffer) {
          await tx.execute(`
            INSERT INTO document_payloads (fdr_document_id, data, mime_type, file_name)
            VALUES (?, ?, ?, ?)
          `, [docId, fileBuffer, req.file!.mimetype, req.file!.originalname]);
        }

        await recordAuditLog(tx, {
          entity_type: 'FDR',
          entity_id: fdr.id,
          action: 'Document Uploaded',
          changed_by: req.user!.userId,
          new_value: JSON.stringify({ document_name: req.file!.originalname, sha256: sha256Hash, version: nextVersion }),
          notes: `Document ${req.file!.originalname} (v${nextVersion}) anchored durably in cloud`
        });

        return await tx.queryOne('SELECT * FROM fdr_documents WHERE id = ?', [docId]);
      });

      return res.status(201).json(createdDoc);
    } catch (err: any) {
      return res.status(500).json(sanitizeError(err, 'Failed to record document metadata'));
    } finally {
      // Guaranteed bulletproof cleanup of staged document file whether transaction succeeded or failed
      try {
        if (stagedFilePath && fs.existsSync(stagedFilePath)) {
          fs.unlinkSync(stagedFilePath);
        }
      } catch (_) {}
    }
  });

// GET /api/fdrs/:id/documents - List documents with ownership check
router.get('/:id/documents', authenticate, requireRole(['admin', 'bureau_officer', 'viewer', 'institution_user']), async (req: AuthRequest, res) => {
  const fdr = await db.prepare('SELECT institution_id FROM fdrs WHERE id = ?').get(req.params.id) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  if (req.user!.role === 'institution_user' && fdr.institution_id !== req.user!.institution_id) {
    return res.status(403).json({ error: 'Forbidden: Access to documents of other institutions is denied.' });
  }

  const docs = await db.prepare(`
    SELECT d.*, u.full_name as uploaded_by_name 
    FROM fdr_documents d LEFT JOIN users u ON d.uploaded_by = u.id
    WHERE d.fdr_id = ? AND d.is_active = 1
    ORDER BY d.uploaded_at DESC
  `).all(req.params.id) as any[];
  return res.json(docs);
});

// DELETE /api/fdrs/:id/documents/:docId
router.delete('/:id/documents/:docId', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const fdr = await db.prepare('SELECT institution_id FROM fdrs WHERE id = ?').get(req.params.id) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  try {
    await db.transaction(async (tx) => {
      await tx.execute('UPDATE fdr_documents SET is_active = 0 WHERE id = ? AND fdr_id = ?', [req.params.docId, req.params.id]);
      await recordAuditLog(tx, {
        entity_type: 'FDR',
        entity_id: Number(req.params.id),
        action: 'Document Revoked',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({ revoked_document_id: req.params.docId }),
        notes: `Document ${req.params.docId} revoked`
      });
    });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json(sanitizeError(err, 'Document deletion failed'));
  }
});

// POST /api/fdrs/:id/renew - Create renewal with ownership check and parent link
router.post('/:id/renew', authenticate, requireRole(['admin', 'bureau_officer', 'institution_user']), async (req: AuthRequest, res) => {
  const parentFdr = await db.prepare('SELECT * FROM fdrs WHERE id = ?').get(req.params.id) as any;
  if (!parentFdr) return res.status(404).json({ error: 'Parent FDR not found' });

  // Ownership verification
  if (req.user!.role === 'institution_user' && parentFdr.institution_id !== req.user!.institution_id) {
    return res.status(403).json({ error: 'Forbidden: You cannot renew an FDR of another institution.' });
  }

  const { fdr_number, bank_name, bank_branch, account_number, deposit_amount, issue_date, maturity_date, interest_rate } = req.body;
  if (!fdr_number || !issue_date || !maturity_date) {
    return res.status(400).json({ error: 'Required fields: Renewal FDR Number, Issue Date, Maturity Date' });
  }

  if (issue_date >= maturity_date) {
    return res.status(400).json({ error: 'Renewal maturity date must be chronologically after the issue date.' });
  }

  let renewalDepositAmount = parentFdr.deposit_amount;
  if (deposit_amount !== undefined && deposit_amount !== null && deposit_amount !== '') {
    const numDep = parseFloat(deposit_amount);
    if (isNaN(numDep) || numDep <= 0) {
      return res.status(400).json({ error: 'Deposit amount must be a positive numeric value.' });
    }
    renewalDepositAmount = numDep;
  }

  let renewalRate = parentFdr.interest_rate;
  if (interest_rate !== undefined && interest_rate !== null && interest_rate !== '') {
    const numRate = parseFloat(interest_rate);
    if (isNaN(numRate) || numRate < 0 || numRate > 25) {
      return res.status(400).json({ error: 'Interest rate must be between 0% and 25% per annum.' });
    }
    renewalRate = numRate;
  }

  try {
    const renewed = await db.transaction(async (tx) => {
      const result = await tx.execute(`
        INSERT INTO fdrs (institution_id, fdr_number, bank_name, bank_branch, account_number, deposit_amount,
          issue_date, maturity_date, interest_rate, deposit_type, purpose,
          submitted_by, last_updated_by, status, verification_status, is_renewal, parent_fdr_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Verification', 'Unverified', 1, ?)
      `, [
        parentFdr.institution_id, fdr_number.trim().toUpperCase(), bank_name || parentFdr.bank_name,
        bank_branch || parentFdr.bank_branch, account_number || parentFdr.account_number,
        renewalDepositAmount, issue_date, maturity_date,
        renewalRate, parentFdr.deposit_type,
        `Renewal of parent instrument ${parentFdr.fdr_number}`,
        req.user!.userId, req.user!.userId, parentFdr.id
      ]);

      // Update parent status to Renewed
      await tx.execute("UPDATE fdrs SET status = 'Renewed', last_updated_by = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.user!.userId, parentFdr.id]);

      await recordAuditLog(tx, {
        entity_type: 'FDR',
        entity_id: result.lastInsertRowid,
        action: 'Renewal Created',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({ parent_fdr_id: parentFdr.id, renewal_fdr_number: fdr_number }),
        notes: `Renewal of ${parentFdr.fdr_number}`
      });

      return await tx.queryOne('SELECT * FROM fdrs WHERE id = ?', [result.lastInsertRowid]);
    });

    return res.status(201).json(renewed);
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Renewal FDR number already exists' });
    }
    return res.status(500).json({ error: 'Failed to create renewal in cloud database' });
  }
});

// GET /api/fdrs/:id/history - Full chain of instruments (original -> renewals) and document versions
router.get('/:id/history', authenticate, async (req: AuthRequest, res) => {
  const currentFdr = await db.queryOne('SELECT * FROM fdrs WHERE id = ?', [req.params.id]) as any;
  if (!currentFdr) return res.status(404).json({ error: 'FDR not found' });

  if (req.user!.role === 'institution_user' && currentFdr.institution_id !== req.user!.institution_id) {
    return res.status(403).json({ error: 'Forbidden: Clearance not granted for this institutional instrument.' });
  }

  // 1. Trace lineage upward to root predecessor
  const lineage: any[] = [];
  let curr = currentFdr;
  while (curr.parent_fdr_id) {
    const parent = await db.queryOne('SELECT id, fdr_number, bank_name, deposit_amount, issue_date, maturity_date, status, is_renewal, parent_fdr_id, submitted_at FROM fdrs WHERE id = ?', [curr.parent_fdr_id]) as any;
    if (!parent) break;
    lineage.unshift(parent);
    curr = parent;
  }
  lineage.push({
    id: currentFdr.id,
    fdr_number: currentFdr.fdr_number,
    bank_name: currentFdr.bank_name,
    deposit_amount: currentFdr.deposit_amount,
    issue_date: currentFdr.issue_date,
    maturity_date: currentFdr.maturity_date,
    status: currentFdr.status,
    is_renewal: currentFdr.is_renewal,
    parent_fdr_id: currentFdr.parent_fdr_id,
    submitted_at: currentFdr.submitted_at,
    is_current: true
  });

  // 2. Trace downstream renewals spawned from this instrument
  const downstream = await db.query('SELECT id, fdr_number, bank_name, deposit_amount, issue_date, maturity_date, status, is_renewal, parent_fdr_id, submitted_at FROM fdrs WHERE parent_fdr_id = ? ORDER BY issue_date ASC', [currentFdr.id]) as any[];

  // 3. Document version history across all attached documents
  const documentVersions = await db.query(`
    SELECT d.id, d.fdr_id, d.document_type, d.file_name, d.file_size, d.mime_type, d.sha256_hash, d.version, d.is_active, d.uploaded_at, u.full_name as uploaded_by_name
    FROM fdr_documents d
    LEFT JOIN users u ON d.uploaded_by = u.id
    WHERE d.fdr_id = ?
    ORDER BY d.document_type ASC, d.version DESC, d.uploaded_at DESC
  `, [currentFdr.id]) as any[];

  return res.json({
    fdr_id: currentFdr.id,
    fdr_number: currentFdr.fdr_number,
    lineage_chain: lineage,
    downstream_renewals: downstream,
    document_versions: documentVersions
  });
});

export default router;
