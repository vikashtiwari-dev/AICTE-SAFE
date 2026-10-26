import express from 'express';
import { db, executeMutation } from '../db/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/institutions - list with summary statistics and institution isolation
router.get('/', authenticate, (req: AuthRequest, res) => {
  let whereClause = '';
  const params: any[] = [];

  // Institution users can only view their own registered institution
  if (req.user!.role === 'institution_user') {
    if (!req.user!.institution_id) {
      return res.status(403).json({ error: 'Access denied: User account is not associated with any registered institution.' });
    }
    whereClause = 'WHERE i.id = ?';
    params.push(req.user!.institution_id);
  }

  const institutions = db.prepare(`
    SELECT i.*,
      COUNT(f.id) as total_fdrs,
      COALESCE(SUM(CASE WHEN f.status NOT IN ('Released', 'Cancelled') THEN f.deposit_amount ELSE 0 END), 0) as total_deposit_amount,
      SUM(CASE WHEN f.status = 'Active' THEN 1 ELSE 0 END) as active_fdrs,
      SUM(CASE WHEN f.status = 'Expiring Soon' THEN 1 ELSE 0 END) as expiring_soon_fdrs,
      SUM(CASE WHEN f.verification_status = 'Discrepancy' THEN 1 ELSE 0 END) as discrepancy_count
    FROM institutions i
    LEFT JOIN fdrs f ON i.id = f.institution_id
    ${whereClause}
    GROUP BY i.id
    ORDER BY i.name ASC
  `).all(...params) as any[];

  return res.json(institutions);
});

// GET /api/institutions/:id - Single institution with ownership enforcement
router.get('/:id', authenticate, (req: AuthRequest, res) => {
  // Strict ownership check for institution user
  if (req.user!.role === 'institution_user') {
    if (!req.user!.institution_id || Number(req.user!.institution_id) !== Number(req.params.id)) {
      return res.status(403).json({ error: 'Access denied: You can only access records of your assigned institution.' });
    }
  }

  const institution = db.prepare(`
    SELECT i.*,
      COUNT(f.id) as total_fdrs,
      COALESCE(SUM(CASE WHEN f.status NOT IN ('Released', 'Cancelled') THEN f.deposit_amount ELSE 0 END), 0) as total_deposit_amount,
      SUM(CASE WHEN f.status = 'Active' THEN 1 ELSE 0 END) as active_fdrs,
      SUM(CASE WHEN f.status = 'Expiring Soon' THEN 1 ELSE 0 END) as expiring_soon_fdrs,
      SUM(CASE WHEN f.status = 'Matured' THEN 1 ELSE 0 END) as matured_fdrs
    FROM institutions i
    LEFT JOIN fdrs f ON i.id = f.institution_id
    WHERE i.id = ?
    GROUP BY i.id
  `).get(req.params.id) as any;

  if (!institution) {
    return res.status(404).json({ error: 'Institution not found' });
  }

  // Get associated FDRs
  const fdrs = db.prepare(`
    SELECT f.*,
      CAST(julianday(f.maturity_date) - julianday('now') AS INTEGER) as days_to_maturity
    FROM fdrs f
    WHERE f.institution_id = ?
    ORDER BY f.maturity_date ASC
  `).all(req.params.id) as any[];

  return res.json({ ...institution, fdrs });
});

// POST /api/institutions/requests - Submit onboarding request (Applicant colleges)
router.post('/requests', async (req, res) => {
  const { aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type, justification } = req.body;

  if (!aicte_id || !name || !contact_email) {
    return res.status(400).json({ error: 'AICTE ID, institution name, and contact email are required' });
  }

  const existing = db.prepare('SELECT id FROM institutions WHERE aicte_id = ?').get(aicte_id);
  if (existing) {
    return res.status(409).json({ error: `Institution with AICTE ID "${aicte_id}" is already active and registered in the portal.` });
  }

  const pending = db.prepare('SELECT id FROM institution_requests WHERE aicte_id = ? AND status = "Pending"').get(aicte_id);
  if (pending) {
    return res.status(409).json({ error: `An onboarding application for AICTE ID "${aicte_id}" is already pending Council review.` });
  }

  try {
    const result = await executeMutation(`
      INSERT INTO institution_requests (aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type, justification, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
    `, [aicte_id, name, address || null, state || null, city || null, contact_person || null, contact_email, contact_phone || null, institution_type || 'Engineering', justification || null]);

    return res.status(201).json({
      message: 'Onboarding request submitted successfully. It is now awaiting Council Administrator approval.',
      request: db.prepare('SELECT * FROM institution_requests WHERE id = ?').get(result.lastInsertRowid)
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to submit onboarding request', details: err.message });
  }
});

// GET /api/institutions/requests - List onboarding requests (Admin & Bureau Officer)
router.get('/requests', authenticate, requireRole(['admin', 'bureau_officer']), (req: AuthRequest, res) => {
  const { status } = req.query;
  let sql = `
    SELECT r.*, u.full_name as reviewer_name 
    FROM institution_requests r 
    LEFT JOIN users u ON r.reviewed_by = u.id
  `;
  const params: any[] = [];
  if (status) {
    sql += ' WHERE r.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY r.requested_at DESC';

  const requests = db.prepare(sql).all(...params);
  return res.json(requests);
});

// PATCH /api/institutions/requests/:id/approve - Approve onboarding request
router.patch('/requests/:id/approve', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const request = db.prepare('SELECT * FROM institution_requests WHERE id = ?').get(req.params.id) as any;
  if (!request) {
    return res.status(404).json({ error: 'Onboarding request not found' });
  }
  if (request.status !== 'Pending') {
    return res.status(400).json({ error: `Request has already been ${request.status.toLowerCase()}` });
  }

  try {
    const instResult = await executeMutation(`
      INSERT INTO institutions (aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      request.aicte_id, request.name, request.address, request.state, request.city,
      request.contact_person, request.contact_email, request.contact_phone, request.institution_type
    ]);

    await executeMutation(`
      UPDATE institution_requests 
      SET status = 'Approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [req.user!.userId, request.id]);

    await executeMutation(`
      INSERT INTO audit_log (entity_type, entity_id, action, user_id, new_state)
      VALUES ('Institution', ?, 'Onboarding Approved', ?, ?)
    `, [instResult.lastInsertRowid, req.user!.userId, JSON.stringify({ aicte_id: request.aicte_id, name: request.name })]);

    const newInstitution = db.prepare('SELECT * FROM institutions WHERE id = ?').get(instResult.lastInsertRowid);
    return res.json({
      message: 'Institution onboarding request approved successfully.',
      institution: newInstitution
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to approve onboarding request', details: err.message });
  }
});

// PATCH /api/institutions/requests/:id/reject - Reject onboarding request
router.patch('/requests/:id/reject', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const { remarks } = req.body;
  if (!remarks) {
    return res.status(400).json({ error: 'Rejection reason/remarks are mandatory.' });
  }

  const request = db.prepare('SELECT * FROM institution_requests WHERE id = ?').get(req.params.id) as any;
  if (!request) {
    return res.status(404).json({ error: 'Onboarding request not found' });
  }
  if (request.status !== 'Pending') {
    return res.status(400).json({ error: `Request has already been ${request.status.toLowerCase()}` });
  }

  try {
    await executeMutation(`
      UPDATE institution_requests 
      SET status = 'Rejected', remarks = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [remarks, req.user!.userId, request.id]);

    await executeMutation(`
      INSERT INTO audit_log (entity_type, entity_id, action, user_id, new_state)
      VALUES ('InstitutionRequest', ?, 'Onboarding Rejected', ?, ?)
    `, [request.id, req.user!.userId, JSON.stringify({ rejection_reason: remarks })]);

    return res.json({ message: 'Institution onboarding request rejected.', remarks });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to reject request', details: err.message });
  }
});

// POST /api/institutions (admin only)
router.post('/', authenticate, requireRole(['admin']), async (req: AuthRequest, res) => {
  const { aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type } = req.body;

  if (!aicte_id || !name) {
    return res.status(400).json({ error: 'AICTE ID and institution name are required' });
  }

  try {
    const result = await executeMutation(`
      INSERT INTO institutions (aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [aicte_id, name, address || null, state || null, city || null, contact_person || null, contact_email || null, contact_phone || null, institution_type || 'Engineering']);

    return res.status(201).json(db.prepare('SELECT * FROM institutions WHERE id = ?').get(result.lastInsertRowid));
  } catch (err: any) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'AICTE ID already registered' });
    }
    return res.status(500).json({ error: 'Failed to create institution', details: err.message });
  }
});

export default router;
