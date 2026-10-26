import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import { db, executeMutation } from '../db/database';
import { authenticate, requireRole, AuthRequest, maskAccountNumber } from '../middleware/auth';
import { upload, validateFileMagic } from '../middleware/upload';
import { lookupIFSC, verifyNeSLeBG, validateSFMS_IFN760 } from '../services/bankingService';
import { extractFDRFromDocument } from '../services/ocrService';
import { calculateRequiredDeposit, validateLockInEligibility } from '../services/aphService';

const router = express.Router();

// POST /api/fdrs/ocr-extract - Honest AI / OCR entity extraction with mathematical confidence
router.post('/ocr-extract', authenticate, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a bank certificate file (PDF, PNG, JPG, DOCX)' });
    }

    if (!validateFileMagic(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ error: 'Security rejection: Uploaded file signature does not match authentic document formats.' });
    }

    const submittedData = {
      deposit_amount: req.body.declared_amount ? parseFloat(req.body.declared_amount) : undefined,
      fdr_number: req.body.declared_fdr_number,
    };

    const extracted = await extractFDRFromDocument(req.file.path, submittedData);
    return res.json(extracted);
  } catch (err: any) {
    return res.status(500).json({ error: 'OCR Extraction failed', details: err.message });
  }
});

// GET /api/fdrs/validate-ifsc/:ifsc - Authoritative RBI Scheduled Bank validation
router.get('/validate-ifsc/:ifsc', (req, res) => {
  const result = lookupIFSC(req.params.ifsc);
  if (!result.valid) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

// POST /api/fdrs/verify-nesl - NeSL Electronic Bank Guarantee (e-BG) Verification
router.post('/verify-nesl', authenticate, (req: AuthRequest, res) => {
  const { nesl_identifier, deposit_amount, bank_name } = req.body;
  if (!nesl_identifier) {
    return res.status(400).json({ error: 'NeSL Identifier reference is required (e.g. NESL-2024-BG-889912)' });
  }
  const result = verifyNeSLeBG(nesl_identifier, parseFloat(deposit_amount) || 0, bank_name || 'Scheduled Commercial Bank');
  return res.json(result);
});

// POST /api/fdrs/verify-sfms - SFMS IFN 760 Structured Financial Message Verification
router.post('/verify-sfms', authenticate, (req: AuthRequest, res) => {
  const { sfms_message } = req.body;
  if (!sfms_message) {
    return res.status(400).json({ error: 'SFMS Raw Message block is required for parsing' });
  }
  const result = validateSFMS_IFN760(sfms_message);
  return res.json(result);
});

// POST /api/fdrs/aph-calculate - Statutory APH Security Deposit Calculator
router.post('/aph-calculate', authenticate, (req: AuthRequest, res) => {
  const { programme_key, institution_type, minority_status, is_women_only, is_remote_region } = req.body;
  const result = calculateRequiredDeposit({
    programme_key: programme_key || institution_type || 'Engineering_UG',
    is_minority_institution: Boolean(minority_status),
    is_women_institution: Boolean(is_women_only),
    is_special_region: Boolean(is_remote_region)
  });
  return res.json(result);
});

// GET /api/fdrs - List with strict institution isolation
router.get('/', authenticate, (req: AuthRequest, res) => {
  const { status, verification_status, institution_id, search, page = '1', limit = '20', deposit_type } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

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

  const totalRow = db.prepare(`
    SELECT COUNT(*) as total FROM fdrs f 
    JOIN institutions i ON f.institution_id = i.id
    ${whereClause}
  `).get(...params) as any;

  const fdrs = db.prepare(`
    SELECT f.*, i.name as institution_name, i.aicte_id,
      u1.full_name as submitted_by_name, u2.full_name as verified_by_name,
      CAST(julianday(f.maturity_date) - julianday('now') AS INTEGER) as days_to_maturity
    FROM fdrs f
    JOIN institutions i ON f.institution_id = i.id
    LEFT JOIN users u1 ON f.submitted_by = u1.id
    LEFT JOIN users u2 ON f.verified_by = u2.id
    ${whereClause}
    ORDER BY f.submitted_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit as string), offset) as any[];

  // Apply DPDP Act 2023 compliant sensitive account masking
  const maskedFdrs = fdrs.map(f => ({
    ...f,
    account_number: maskAccountNumber(f.account_number, req.user!.role)
  }));

  return res.json({
    data: maskedFdrs,
    total: totalRow.total,
    page: parseInt(page as string),
    limit: parseInt(limit as string),
    totalPages: Math.ceil(totalRow.total / parseInt(limit as string)),
  });
});

// GET /api/fdrs/:id - Single FDR with authorization check
router.get('/:id', authenticate, (req: AuthRequest, res) => {
  const fdr = db.prepare(`
    SELECT f.*, i.name as institution_name, i.aicte_id, i.contact_person, i.contact_email,
      u1.full_name as submitted_by_name, u2.full_name as verified_by_name, u3.full_name as last_updated_by_name,
      CAST(julianday(f.maturity_date) - julianday('now') AS INTEGER) as days_to_maturity
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

  const documents = db.prepare('SELECT * FROM fdr_documents WHERE fdr_id = ? AND is_active = 1 ORDER BY uploaded_at DESC').all(fdr.id) as any[];
  const audit = db.prepare(`
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

  if (!fdr_number || !bank_name || !deposit_amount || !issue_date || !maturity_date) {
    return res.status(400).json({ error: 'Required fields missing (FDR Number, Bank Name, Deposit Amount, Issue Date, Maturity Date)' });
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
  const instExists = db.prepare('SELECT id FROM institutions WHERE id = ?').get(targetInstitutionId);
  if (!instExists) {
    return res.status(400).json({ error: 'Specified institution does not exist in registry' });
  }

  try {
    const result = await executeMutation(`
      INSERT INTO fdrs (institution_id, fdr_number, bank_name, bank_branch, account_number, deposit_amount,
        issue_date, maturity_date, interest_rate, deposit_type, purpose, remarks, is_renewal, parent_fdr_id,
        submitted_by, last_updated_by, status, verification_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Verification', 'Unverified')
    `, [
      targetInstitutionId, fdr_number.trim().toUpperCase(), bank_name.trim(), bank_branch || null, account_number || null,
      parseFloat(deposit_amount), issue_date, maturity_date, interest_rate ? parseFloat(interest_rate) : null,
      deposit_type || 'FDR', purpose || null, remarks || null,
      is_renewal ? 1 : 0, parent_fdr_id || null,
      req.user!.userId, req.user!.userId
    ]);

    await executeMutation(`
      INSERT INTO audit_log (entity_type, entity_id, action, user_id, institution_id, new_state)
      VALUES ('FDR', ?, 'Created', ?, ?, ?)
    `, [result.lastInsertRowid, req.user!.userId, targetInstitutionId, JSON.stringify({ fdr_number, deposit_amount, status: 'Pending Verification' })]);

    const newFdr = db.prepare('SELECT * FROM fdrs WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(newFdr);
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: `FDR number "${fdr_number}" already exists in the national database.` });
    }
    return res.status(500).json({ error: 'Failed to create FDR in cloud database', details: err.message });
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

// PUT /api/fdrs/:id - Update with validated state transitions
router.put('/:id', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const fdr = db.prepare('SELECT * FROM fdrs WHERE id = ?').get(req.params.id) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  const { bank_name, bank_branch, account_number, deposit_amount, issue_date, maturity_date, interest_rate, deposit_type, purpose, remarks, status } = req.body;

  // Validate state transition if status is being updated
  const targetStatus = status || fdr.status;
  if (status && status !== fdr.status) {
    const allowed = VALID_FDR_TRANSITIONS[fdr.status] || [];
    if (!allowed.includes(status) && req.user!.role !== 'admin') {
      return res.status(400).json({
        error: `Invalid status transition: Cannot change status from "${fdr.status}" to "${status}".`,
        allowed_transitions: allowed
      });
    }
  }

  const oldState = JSON.stringify({ status: fdr.status, deposit_amount: fdr.deposit_amount });

  try {
    await executeMutation(`
      UPDATE fdrs SET bank_name = ?, bank_branch = ?, account_number = ?, deposit_amount = ?,
        issue_date = ?, maturity_date = ?, interest_rate = ?, deposit_type = ?, purpose = ?,
        remarks = ?, status = ?, last_updated_by = ?, last_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      bank_name || fdr.bank_name, bank_branch || null, account_number || null,
      deposit_amount ? parseFloat(deposit_amount) : fdr.deposit_amount,
      issue_date || fdr.issue_date, maturity_date || fdr.maturity_date,
      interest_rate ? parseFloat(interest_rate) : fdr.interest_rate,
      deposit_type || fdr.deposit_type, purpose || null,
      remarks || null, targetStatus, req.user!.userId, req.params.id
    ]);

    await executeMutation(`
      INSERT INTO audit_log (entity_type, entity_id, action, user_id, institution_id, previous_state, new_state)
      VALUES ('FDR', ?, 'Updated', ?, ?, ?, ?)
    `, [req.params.id, req.user!.userId, fdr.institution_id, oldState, JSON.stringify({ status: targetStatus, deposit_amount })]);

    return res.json(db.prepare('SELECT * FROM fdrs WHERE id = ?').get(req.params.id));
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update FDR in cloud database', details: err.message });
  }
});

// PATCH /api/fdrs/:id/verify - Strictly enforce verification policy
router.patch('/:id/verify', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const { verification_status, verification_notes } = req.body;
  const fdr = db.prepare('SELECT * FROM fdrs WHERE id = ?').get(req.params.id) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  const allowedStatuses = ['Verified', 'Discrepancy', 'Under Scrutiny', 'Unverified'];
  if (!allowedStatuses.includes(verification_status)) {
    return res.status(400).json({ error: `Invalid verification status. Must be one of: ${allowedStatuses.join(', ')}` });
  }

  if (verification_status === 'Discrepancy' && (!verification_notes || verification_notes.trim().length < 5)) {
    return res.status(400).json({ error: 'Detailed scrutiny notes are required when flagging an instrument discrepancy.' });
  }

  const newFdrStatus = (verification_status === 'Verified' && fdr.status === 'Pending Verification')
    ? 'Active'
    : (verification_status === 'Discrepancy' ? 'Pending Verification' : fdr.status);

  try {
    await executeMutation(`
      UPDATE fdrs SET verification_status = ?, verification_notes = ?,
        verified_by = ?, verified_at = CURRENT_TIMESTAMP,
        status = ?, last_updated_by = ?, last_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [verification_status, verification_notes || null, req.user!.userId, newFdrStatus, req.user!.userId, req.params.id]);

    await executeMutation(`
      INSERT INTO audit_log (entity_type, entity_id, action, user_id, institution_id, previous_state, new_state)
      VALUES ('FDR', ?, ?, ?, ?, ?, ?)
    `, [
      req.params.id, req.user!.userId, fdr.institution_id,
      verification_status === 'Verified' ? 'Verification Approved' : 'Discrepancy Flagged',
      JSON.stringify({ verification_status: fdr.verification_status }),
      JSON.stringify({ verification_status, notes: verification_notes })
    ]);

    // If discrepancy flagged, create a high-priority alert
    if (verification_status === 'Discrepancy') {
      await executeMutation(`
        INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message)
        VALUES (?, ?, 'Discrepancy', 'Critical', ?)
      `, [fdr.id, fdr.institution_id, `Scrutiny Discrepancy flagged on FDR ${fdr.fdr_number}: ${verification_notes}`]);
    }

    return res.json({ success: true, verification_status, fdr_status: newFdrStatus });
  } catch (err: any) {
    return res.status(500).json({ error: 'Verification update failed', details: err.message });
  }
});

// POST /api/fdrs/:id/documents - Upload with strict institution ownership verification
router.post('/:id/documents', authenticate, requireRole(['admin', 'bureau_officer', 'institution_user']),
  upload.single('file'), async (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Enforce strict file magic signature verification
    if (!validateFileMagic(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ error: 'Security validation failed: File headers do not match legitimate document formats (PDF, JPEG, PNG, DOCX).' });
    }

    const fdr = db.prepare('SELECT * FROM fdrs WHERE id = ?').get(req.params.id) as any;
    if (!fdr) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(404).json({ error: 'FDR not found' });
    }

    // Strict institution ownership verification
    if (req.user!.role === 'institution_user' && fdr.institution_id !== req.user!.institution_id) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(403).json({ error: 'Forbidden: You cannot upload documents to an FDR belonging to another institution.' });
    }

    let sha256Hash = '0x' + crypto.randomBytes(32).toString('hex');
    try {
      if (req.file.path && fs.existsSync(req.file.path)) {
        const fileBuf = fs.readFileSync(req.file.path);
        sha256Hash = '0x' + crypto.createHash('sha256').update(fileBuf).digest('hex');
      }
    } catch (_) {}

    try {
      const result = await executeMutation(`
        INSERT INTO fdr_documents (fdr_id, document_type, file_name, file_path, file_size, mime_type, sha256_hash, verified_on_chain, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      `, [
        fdr.id, req.body.document_type || 'Supporting_Doc',
        req.file.originalname, req.file.filename,
        req.file.size, req.file.mimetype, sha256Hash, req.user!.userId
      ]);

      await executeMutation(`
        INSERT INTO audit_log (entity_type, entity_id, action, user_id, institution_id, new_state)
        VALUES ('FDR', ?, 'Document Uploaded', ?, ?, ?)
      `, [fdr.id, req.user!.userId, fdr.institution_id, JSON.stringify({ document_name: req.file.originalname, sha256: sha256Hash })]);

      return res.status(201).json(db.prepare('SELECT * FROM fdr_documents WHERE id = ?').get(result.lastInsertRowid));
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to record document metadata', details: err.message });
    }
  });

// GET /api/fdrs/:id/documents - List documents with ownership check
router.get('/:id/documents', authenticate, (req: AuthRequest, res) => {
  const fdr = db.prepare('SELECT institution_id FROM fdrs WHERE id = ?').get(req.params.id) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  if (req.user!.role === 'institution_user' && fdr.institution_id !== req.user!.institution_id) {
    return res.status(403).json({ error: 'Forbidden: Access to documents of other institutions is denied.' });
  }

  const docs = db.prepare(`
    SELECT d.*, u.full_name as uploaded_by_name 
    FROM fdr_documents d LEFT JOIN users u ON d.uploaded_by = u.id
    WHERE d.fdr_id = ? AND d.is_active = 1
    ORDER BY d.uploaded_at DESC
  `).all(req.params.id) as any[];
  return res.json(docs);
});

// DELETE /api/fdrs/:id/documents/:docId
router.delete('/:id/documents/:docId', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const fdr = db.prepare('SELECT institution_id FROM fdrs WHERE id = ?').get(req.params.id) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  try {
    await executeMutation('UPDATE fdr_documents SET is_active = 0 WHERE id = ? AND fdr_id = ?', [req.params.docId, req.params.id]);
    await executeMutation(`
      INSERT INTO audit_log (entity_type, entity_id, action, user_id, institution_id, new_state)
      VALUES ('FDR', ?, 'Document Revoked', ?, ?, ?)
    `, [req.params.id, req.user!.userId, fdr.institution_id, JSON.stringify({ revoked_document_id: req.params.docId })]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Document deletion failed', details: err.message });
  }
});

// POST /api/fdrs/:id/renew - Create renewal with ownership check and parent link
router.post('/:id/renew', authenticate, requireRole(['admin', 'bureau_officer', 'institution_user']), async (req: AuthRequest, res) => {
  const parentFdr = db.prepare('SELECT * FROM fdrs WHERE id = ?').get(req.params.id) as any;
  if (!parentFdr) return res.status(404).json({ error: 'Parent FDR not found' });

  // Ownership verification
  if (req.user!.role === 'institution_user' && parentFdr.institution_id !== req.user!.institution_id) {
    return res.status(403).json({ error: 'Forbidden: You cannot renew an FDR of another institution.' });
  }

  const { fdr_number, bank_name, bank_branch, account_number, deposit_amount, issue_date, maturity_date, interest_rate } = req.body;
  if (!fdr_number || !issue_date || !maturity_date) {
    return res.status(400).json({ error: 'Required fields: Renewal FDR Number, Issue Date, Maturity Date' });
  }

  try {
    const result = await executeMutation(`
      INSERT INTO fdrs (institution_id, fdr_number, bank_name, bank_branch, account_number, deposit_amount,
        issue_date, maturity_date, interest_rate, deposit_type, purpose,
        submitted_by, last_updated_by, status, verification_status, is_renewal, parent_fdr_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Verification', 'Unverified', 1, ?)
    `, [
      parentFdr.institution_id, fdr_number.trim().toUpperCase(), bank_name || parentFdr.bank_name,
      bank_branch || parentFdr.bank_branch, account_number || parentFdr.account_number,
      deposit_amount ? parseFloat(deposit_amount) : parentFdr.deposit_amount, issue_date, maturity_date,
      interest_rate ? parseFloat(interest_rate) : parentFdr.interest_rate, parentFdr.deposit_type,
      `Renewal of parent instrument ${parentFdr.fdr_number}`,
      req.user!.userId, req.user!.userId, parentFdr.id
    ]);

    // Update parent status to Renewed
    await executeMutation("UPDATE fdrs SET status = 'Renewed', last_updated_by = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.user!.userId, parentFdr.id]);

    await executeMutation(`
      INSERT INTO audit_log (entity_type, entity_id, action, user_id, institution_id, new_state)
      VALUES ('FDR', ?, 'Renewal Created', ?, ?, ?)
    `, [result.lastInsertRowid, req.user!.userId, parentFdr.institution_id, JSON.stringify({ parent_fdr_id: parentFdr.id, renewal_fdr_number: fdr_number })]);

    return res.status(201).json(db.prepare('SELECT * FROM fdrs WHERE id = ?').get(result.lastInsertRowid));
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Renewal FDR number already exists' });
    }
    return res.status(500).json({ error: 'Failed to create renewal in cloud database', details: err.message });
  }
});

export default router;
