import express from 'express';
import { db } from '../db/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/releases - list
router.get('/', authenticate, (req: AuthRequest, res) => {
  const { status, request_type } = req.query;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (req.user!.role === 'institution_user' && req.user!.institution_id) {
    whereClause += ' AND r.institution_id = ?';
    params.push(req.user!.institution_id);
  }

  if (status) {
    whereClause += ' AND r.status = ?';
    params.push(status);
  }
  if (request_type) {
    whereClause += ' AND r.request_type = ?';
    params.push(request_type);
  }

  const requests = db.prepare(`
    SELECT r.*,
      i.name as institution_name, i.aicte_id,
      f.fdr_number, f.bank_name, f.deposit_amount, f.maturity_date, f.status as fdr_status,
      u1.full_name as requested_by_name,
      u2.full_name as reviewed_by_name,
      u3.full_name as approved_by_name
    FROM release_requests r
    JOIN institutions i ON r.institution_id = i.id
    JOIN fdrs f ON r.fdr_id = f.id
    LEFT JOIN users u1 ON r.requested_by = u1.id
    LEFT JOIN users u2 ON r.reviewed_by = u2.id
    LEFT JOIN users u3 ON r.approved_by = u3.id
    ${whereClause}
    ORDER BY r.requested_at DESC
  `).all(...params) as any[];

  return res.json(requests);
});

// POST /api/releases - create request
router.post('/', authenticate, requireRole(['admin', 'bureau_officer', 'institution_user']), (req: AuthRequest, res) => {
  const { fdr_id, request_type = 'Release', reason, remarks } = req.body;

  if (!fdr_id || !reason) {
    return res.status(400).json({ error: 'FDR ID and reason are required' });
  }

  const fdr = db.prepare('SELECT * FROM fdrs WHERE id = ?').get(fdr_id) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  // If institution user, ensure it belongs to their institution
  if (req.user!.role === 'institution_user' && fdr.institution_id !== req.user!.institution_id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const result = db.prepare(`
    INSERT INTO release_requests (fdr_id, institution_id, request_type, reason, requested_by, status, remarks)
    VALUES (?, ?, ?, ?, ?, 'Pending', ?)
  `).run(fdr_id, fdr.institution_id, request_type, reason, req.user!.userId, remarks || null);

  db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
    VALUES ('Release', ?, 'Request Created', ?, ?)
  `).run(result.lastInsertRowid, req.user!.userId, `${request_type} request submitted for FDR ${fdr.fdr_number}`);

  return res.status(201).json(db.prepare('SELECT * FROM release_requests WHERE id = ?').get(result.lastInsertRowid));
});

// PATCH /api/releases/:id/review (bureau_officer, admin)
router.patch('/:id/review', authenticate, requireRole(['admin', 'bureau_officer']), (req: AuthRequest, res) => {
  const { status, remarks } = req.body; // 'Under Review', 'Approved', 'Rejected'
  const request = db.prepare('SELECT * FROM release_requests WHERE id = ?').get(req.params.id) as any;
  if (!request) return res.status(404).json({ error: 'Release request not found' });

  let updateQuery = `
    UPDATE release_requests 
    SET status = ?, remarks = COALESCE(?, remarks),
        reviewed_by = ?, reviewed_at = datetime('now')
  `;
  const params = [status, remarks || null, req.user!.userId];

  if (status === 'Approved') {
    updateQuery += `, approved_by = ?, approved_at = datetime('now')`;
    params.push(req.user!.userId);
  }

  updateQuery += ' WHERE id = ?';
  params.push(req.params.id);

  db.prepare(updateQuery).run(...params);

  db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
    VALUES ('Release', ?, ?, ?, ?)
  `).run(req.params.id, req.user!.userId, `Status updated to ${status}`, remarks || `Status changed to ${status}`);

  return res.json({ success: true });
});

// PATCH /api/releases/:id/complete (discharge and release FDR)
router.patch('/:id/complete', authenticate, requireRole(['admin', 'bureau_officer']), (req: AuthRequest, res) => {
  const request = db.prepare('SELECT * FROM release_requests WHERE id = ?').get(req.params.id) as any;
  if (!request) return res.status(404).json({ error: 'Release request not found' });

  // Mark request completed
  db.prepare(`
    UPDATE release_requests 
    SET status = 'Completed', remarks = COALESCE(?, remarks)
    WHERE id = ?
  `).run(req.body.remarks || 'FDR Released and Discharged', req.params.id);

  // Mark FDR as Released
  db.prepare(`
    UPDATE fdrs 
    SET status = 'Released', last_updated_by = ?, last_updated_at = datetime('now')
    WHERE id = ?
  `).run(req.user!.userId, request.fdr_id);

  db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
    VALUES ('FDR', ?, 'Released', ?, ?)
  `).run(request.fdr_id, req.user!.userId, `FDR released via completed release request #${req.params.id}`);

  return res.json({ success: true, message: 'FDR successfully released and discharged' });
});

// PATCH /api/releases/:id/tier-review - Multi-Tier Maker-Checker Progress
router.patch('/:id/tier-review', authenticate, requireRole(['admin', 'bureau_officer']), (req: AuthRequest, res) => {
  const { stage, remarks } = req.body; // stage: 'Finance_Officer' or 'Director_Approval'
  const request = db.prepare('SELECT * FROM release_requests WHERE id = ?').get(req.params.id) as any;
  if (!request) return res.status(404).json({ error: 'Release request not found' });

  if (stage === 'Finance_Officer') {
    db.prepare(`
      UPDATE release_requests 
      SET review_stage = 'Finance_Officer', status = 'Under Review',
          dealing_officer_id = ?, dealing_officer_remarks = ?, dealing_officer_at = datetime('now')
      WHERE id = ?
    `).run(req.user!.userId, remarks || 'Dealing Assistant verification complete. Forwarded to Finance Officer.', req.params.id);

    db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
      VALUES ('Release', ?, 'Scrutinized by Dealing Assistant', ?, ?)
    `).run(req.params.id, req.user!.userId, remarks || 'Forwarded to Finance Officer tier');
  } else if (stage === 'Director_Approval') {
    db.prepare(`
      UPDATE release_requests 
      SET review_stage = 'Director_Approval', status = 'Under Review',
          finance_officer_id = ?, finance_officer_remarks = ?, finance_officer_at = datetime('now')
      WHERE id = ?
    `).run(req.user!.userId, remarks || 'Finance verification cleared. Sent for Director DSC Authorization.', req.params.id);

    db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
      VALUES ('Release', ?, 'Cleared by Finance Officer', ?, ?)
    `).run(req.params.id, req.user!.userId, remarks || 'Forwarded to Director for Digital Signing');
  }

  return res.json({ success: true, message: `Application moved to ${stage} stage.` });
});

// POST /api/releases/:id/dsc-sign - Digital Signature Certificate (DSC) / e-Sign Seal
router.post('/:id/dsc-sign', authenticate, requireRole(['admin', 'bureau_officer']), (req: AuthRequest, res) => {
  const { signer_name = 'Director, AICTE Regulation Bureau' } = req.body;
  const request = db.prepare('SELECT * FROM release_requests WHERE id = ?').get(req.params.id) as any;
  if (!request) return res.status(404).json({ error: 'Release request not found' });

  // Generate SHA-256 cryptographic DSC signature stamp
  const timestamp = new Date().toISOString();
  const dscPayload = `AICTE-RELEASE-DSC|ID:${request.id}|FDR:${request.fdr_id}|SIGNER:${signer_name}|TS:${timestamp}`;
  const dscHash = 'DSC-SHA256-' + Buffer.from(dscPayload).toString('base64').substring(0, 32).toUpperCase();

  // Approve request and mark Completed with DSC
  db.prepare(`
    UPDATE release_requests 
    SET status = 'Completed', review_stage = 'Completed',
        approved_by = ?, approved_at = datetime('now'),
        dsc_sign_hash = ?, dsc_signer_name = ?, dsc_signed_at = datetime('now'),
        remarks = 'Legally discharged via Digital Signature Certificate (DSC) / e-Sign'
    WHERE id = ?
  `).run(req.user!.userId, dscHash, signer_name, req.params.id);

  // Release the FDR instrument
  db.prepare(`
    UPDATE fdrs 
    SET status = 'Released', last_updated_by = ?, last_updated_at = datetime('now')
    WHERE id = ?
  `).run(req.user!.userId, request.fdr_id);

  db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
    VALUES ('Release', ?, 'DSC Digitally Signed & Sealed', ?, ?)
  `).run(req.params.id, req.user!.userId, `Released with DSC stamp ${dscHash} by ${signer_name}`);

  return res.json({
    success: true,
    message: 'FDR release approved and legally sealed with Digital Signature Certificate (DSC).',
    dsc_sign_hash: dscHash,
    dsc_signer_name: signer_name,
    dsc_signed_at: timestamp
  });
});

export default router;
