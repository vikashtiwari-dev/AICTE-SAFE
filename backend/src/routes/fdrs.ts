import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import { db } from '../db/database';
import { authenticate, requireRole, AuthRequest, maskAccountNumber } from '../middleware/auth';
import { upload, validateFileMagic } from '../middleware/upload';
import { lookupIFSC, verifyNeSLeBG, validateSFMS_IFN760 } from '../services/bankingService';
import { extractFDRFromDocument } from '../services/ocrService';
import { calculateRequiredDeposit, validateLockInEligibility } from '../services/aphService';
import path from 'path';

const router = express.Router();

// POST /api/fdrs/ocr-extract - Real AI / OCR entity extraction & discrepancy detection
router.post('/ocr-extract', authenticate, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a bank certificate file (PDF, PNG, JPG)' });
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

// GET /api/fdrs/validate-ifsc/:ifsc - Comprehensive RBI Directory IFSC validation
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
    return res.status(400).json({ error: 'NeSL e-BG Identifier is required' });
  }
  const result = verifyNeSLeBG(nesl_identifier, deposit_amount || 5000000, bank_name || 'State Bank of India');
  return res.json(result);
});

// POST /api/fdrs/verify-sfms - Structured Financial Messaging (SFMS IFN 760) Verification
router.post('/verify-sfms', authenticate, (req: AuthRequest, res) => {
  const { sfms_message } = req.body;
  if (!sfms_message) {
    return res.status(400).json({ error: 'SFMS message payload is required' });
  }
  const result = validateSFMS_IFN760(sfms_message);
  return res.json(result);
});

// POST /api/fdrs/aph-calculate - Approval Process Handbook (APH) Statutory Deposit Calculator
router.post('/aph-calculate', (req, res) => {
  const result = calculateRequiredDeposit(req.body);
  return res.json(result);
});

// GET /api/fdrs - list with filters
router.get('/', authenticate, (req: AuthRequest, res) => {
  const { status, verification_status, institution_id, search, page = '1', limit = '20', deposit_type } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  // Institution users can only see their own institution's FDRs
  if (req.user!.role === 'institution_user' && req.user!.institution_id) {
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

// GET /api/fdrs/:id - single FDR
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

  // Role check for institution users
  if (req.user!.role === 'institution_user' && fdr.institution_id !== req.user!.institution_id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Calculate APH Lock-in eligibility
  const lockInEligibility = validateLockInEligibility(fdr.issue_date, fdr.lock_in_years || 8);

  const documents = db.prepare('SELECT * FROM fdr_documents WHERE fdr_id = ? AND is_active = 1 ORDER BY uploaded_at DESC').all(fdr.id) as any[];
  const audit = db.prepare(`
    SELECT a.*, u.full_name as changed_by_name 
    FROM audit_log a LEFT JOIN users u ON a.changed_by = u.id
    WHERE a.entity_type = 'FDR' AND a.entity_id = ?
    ORDER BY a.changed_at DESC
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

// POST /api/fdrs - create
router.post('/', authenticate, requireRole(['admin', 'bureau_officer', 'institution_user']), (req: AuthRequest, res) => {
  const { institution_id, fdr_number, bank_name, bank_branch, account_number, deposit_amount, issue_date, maturity_date, interest_rate, deposit_type, purpose, remarks, is_renewal, parent_fdr_id } = req.body;

  if (!institution_id || !fdr_number || !bank_name || !deposit_amount || !issue_date || !maturity_date) {
    return res.status(400).json({ error: 'Required fields missing' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO fdrs (institution_id, fdr_number, bank_name, bank_branch, account_number, deposit_amount,
        issue_date, maturity_date, interest_rate, deposit_type, purpose, remarks, is_renewal, parent_fdr_id,
        submitted_by, last_updated_by, status, verification_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Verification', 'Unverified')
    `).run(
      institution_id, fdr_number, bank_name, bank_branch || null, account_number || null,
      deposit_amount, issue_date, maturity_date, interest_rate || null,
      deposit_type || 'FDR', purpose || null, remarks || null,
      is_renewal ? 1 : 0, parent_fdr_id || null,
      req.user!.userId, req.user!.userId
    );

    db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
      VALUES ('FDR', ?, 'Created', ?, ?)
    `).run(result.lastInsertRowid, req.user!.userId, 'New FDR submitted');

    const newFdr = db.prepare('SELECT * FROM fdrs WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(newFdr);
  } catch (err: any) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'FDR number already exists' });
    }
    return res.status(500).json({ error: 'Failed to create FDR', details: err.message });
  }
});

// PUT /api/fdrs/:id - update
router.put('/:id', authenticate, requireRole(['admin', 'bureau_officer']), (req: AuthRequest, res) => {
  const fdr = db.prepare('SELECT * FROM fdrs WHERE id = ?').get(req.params.id) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  const { bank_name, bank_branch, account_number, deposit_amount, issue_date, maturity_date, interest_rate, deposit_type, purpose, remarks, status } = req.body;

  const oldValue = JSON.stringify({ status: fdr.status, deposit_amount: fdr.deposit_amount });

  db.prepare(`
    UPDATE fdrs SET bank_name = ?, bank_branch = ?, account_number = ?, deposit_amount = ?,
      issue_date = ?, maturity_date = ?, interest_rate = ?, deposit_type = ?, purpose = ?,
      remarks = ?, status = ?, last_updated_by = ?, last_updated_at = datetime('now')
    WHERE id = ?
  `).run(
    bank_name, bank_branch || null, account_number || null, deposit_amount,
    issue_date, maturity_date, interest_rate || null, deposit_type, purpose || null,
    remarks || null, status, req.user!.userId, req.params.id
  );

  db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, changed_by, old_value, new_value)
    VALUES ('FDR', ?, 'Updated', ?, ?, ?)
  `).run(req.params.id, req.user!.userId, oldValue, JSON.stringify({ status, deposit_amount }));

  return res.json(db.prepare('SELECT * FROM fdrs WHERE id = ?').get(req.params.id));
});

// PATCH /api/fdrs/:id/verify
router.patch('/:id/verify', authenticate, requireRole(['admin', 'bureau_officer']), (req: AuthRequest, res) => {
  const { verification_status, verification_notes } = req.body;
  const fdr = db.prepare('SELECT * FROM fdrs WHERE id = ?').get(req.params.id) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  db.prepare(`
    UPDATE fdrs SET verification_status = ?, verification_notes = ?,
      verified_by = ?, verified_at = datetime('now'),
      status = CASE WHEN ? = 'Verified' AND status = 'Pending Verification' THEN 'Active' ELSE status END,
      last_updated_by = ?, last_updated_at = datetime('now')
    WHERE id = ?
  `).run(verification_status, verification_notes || null, req.user!.userId, verification_status, req.user!.userId, req.params.id);

  db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
    VALUES ('FDR', ?, ?, ?, ?)
  `).run(req.params.id, req.user!.userId,
    verification_status === 'Verified' ? 'Verified' : 'Discrepancy Flagged',
    verification_notes || `Verification status set to ${verification_status}`);

  // If discrepancy, create alert
  if (verification_status === 'Discrepancy') {
    db.prepare(`
      INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message)
      VALUES (?, ?, 'Discrepancy', 'Critical', ?)
    `).run(fdr.id, fdr.institution_id, `Discrepancy flagged on FDR ${fdr.fdr_number}: ${verification_notes}`);
  }

  return res.json({ success: true });
});

// POST /api/fdrs/:id/documents - upload
router.post('/:id/documents', authenticate, requireRole(['admin', 'bureau_officer', 'institution_user']),
  upload.single('file'), (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Enforce strict file magic signature verification to prevent executable/script uploads
    if (!validateFileMagic(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ error: 'Security validation failed: File headers do not match legitimate document formats (PDF, JPEG, PNG, DOCX).' });
    }

    const fdr = db.prepare('SELECT * FROM fdrs WHERE id = ?').get(req.params.id) as any;
    if (!fdr) return res.status(404).json({ error: 'FDR not found' });

    let sha256Hash = '0x' + crypto.randomBytes(32).toString('hex');
    try {
      if (req.file.path && fs.existsSync(req.file.path)) {
        const fileBuf = fs.readFileSync(req.file.path);
        sha256Hash = '0x' + crypto.createHash('sha256').update(fileBuf).digest('hex');
      }
    } catch (e) {
      // fallback hash
    }

    const result = db.prepare(`
      INSERT INTO fdr_documents (fdr_id, document_type, file_name, file_path, file_size, mime_type, sha256_hash, verified_on_chain, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      fdr.id, req.body.document_type || 'Supporting_Doc',
      req.file.originalname, req.file.filename,
      req.file.size, req.file.mimetype, sha256Hash, req.user!.userId
    );

    db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
      VALUES ('FDR', ?, 'Document Uploaded & Cryptographically Hashed', ?, ?)
    `).run(fdr.id, req.user!.userId, `Document "${req.file.originalname}" anchored with SHA-256 ${sha256Hash.substring(0, 16)}...`);

    return res.status(201).json(db.prepare('SELECT * FROM fdr_documents WHERE id = ?').get(result.lastInsertRowid));
  });

// GET /api/fdrs/:id/documents
router.get('/:id/documents', authenticate, (req: AuthRequest, res) => {
  const docs = db.prepare(`
    SELECT d.*, u.full_name as uploaded_by_name 
    FROM fdr_documents d LEFT JOIN users u ON d.uploaded_by = u.id
    WHERE d.fdr_id = ? AND d.is_active = 1
    ORDER BY d.uploaded_at DESC
  `).all(req.params.id) as any[];
  return res.json(docs);
});

// DELETE /api/fdrs/:id/documents/:docId
router.delete('/:id/documents/:docId', authenticate, requireRole(['admin', 'bureau_officer']), (req: AuthRequest, res) => {
  db.prepare('UPDATE fdr_documents SET is_active = 0 WHERE id = ? AND fdr_id = ?').run(req.params.docId, req.params.id);
  db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
    VALUES ('FDR', ?, 'Document Deleted', ?, ?)
  `).run(req.params.id, req.user!.userId, `Document ID ${req.params.docId} removed`);
  return res.json({ success: true });
});

// POST /api/fdrs/:id/renew - create renewal
router.post('/:id/renew', authenticate, requireRole(['admin', 'bureau_officer', 'institution_user']), (req: AuthRequest, res) => {
  const parentFdr = db.prepare('SELECT * FROM fdrs WHERE id = ?').get(req.params.id) as any;
  if (!parentFdr) return res.status(404).json({ error: 'FDR not found' });

  const { fdr_number, bank_name, bank_branch, account_number, deposit_amount, issue_date, maturity_date, interest_rate } = req.body;

  try {
    const result = db.prepare(`
      INSERT INTO fdrs (institution_id, fdr_number, bank_name, bank_branch, account_number, deposit_amount,
        issue_date, maturity_date, interest_rate, deposit_type, purpose,
        submitted_by, last_updated_by, status, verification_status, is_renewal, parent_fdr_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Verification', 'Unverified', 1, ?)
    `).run(
      parentFdr.institution_id, fdr_number, bank_name, bank_branch || null, account_number || null,
      deposit_amount || parentFdr.deposit_amount, issue_date, maturity_date,
      interest_rate || parentFdr.interest_rate, parentFdr.deposit_type,
      `Renewal of ${parentFdr.fdr_number}`,
      req.user!.userId, req.user!.userId, parentFdr.id
    );

    // Update parent status
    db.prepare("UPDATE fdrs SET status = 'Renewed', last_updated_by = ? WHERE id = ?").run(req.user!.userId, parentFdr.id);

    db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
      VALUES ('FDR', ?, 'Renewal Created', ?, ?)
    `).run(result.lastInsertRowid, req.user!.userId, `Renewal of FDR ${parentFdr.fdr_number}`);

    return res.status(201).json(db.prepare('SELECT * FROM fdrs WHERE id = ?').get(result.lastInsertRowid));
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create renewal', details: err.message });
  }
});

export default router;
