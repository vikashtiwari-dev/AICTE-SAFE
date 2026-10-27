import express from 'express';
import { db, executeMutation, recordAuditLog } from '../db/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { sanitizeError, onboardingLimiter } from '../middleware/security';

const router = express.Router();

// GET /api/institutions - list with summary statistics and institution isolation
// Explicitly permitted roles: admin, bureau_officer, viewer (read-only), institution_user (isolated to own id)
router.get('/', authenticate, requireRole(['admin', 'bureau_officer', 'viewer', 'institution_user']), async (req: AuthRequest, res) => {
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

  const institutions = await db.prepare(`
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

// GET /api/institutions/:id - Single institution with explicit role-permission matrix and ownership enforcement
router.get('/:id', authenticate, requireRole(['admin', 'bureau_officer', 'viewer', 'institution_user']), async (req: AuthRequest, res) => {
  // Strict ownership check for institution user: Institution A can NEVER access Institution B
  if (req.user!.role === 'institution_user') {
    if (!req.user!.institution_id || Number(req.user!.institution_id) !== Number(req.params.id)) {
      return res.status(403).json({ error: 'Access denied: You can only access records of your assigned institution.' });
    }
  }

  const institution = await db.prepare(`
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
  const fdrs = await db.prepare(`
    SELECT f.*,
      CAST((f.maturity_date - CURRENT_DATE) AS INTEGER) as days_to_maturity
    FROM fdrs f
    WHERE f.institution_id = ?
    ORDER BY f.maturity_date ASC
  `).all(req.params.id) as any[];

  return res.json({ ...institution, fdrs });
});

// POST /api/institutions/requests - Submit onboarding request (Rate-limited, strictly validated schema)
router.post('/requests', onboardingLimiter, async (req, res) => {
  const { aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type, justification } = req.body;

  // Strict schema and field length validations to prevent abuse
  if (!aicte_id || typeof aicte_id !== 'string' || aicte_id.trim().length < 3 || aicte_id.trim().length > 50) {
    return res.status(400).json({ error: 'Valid AICTE Permanent Application ID (3-50 characters) is mandatory.' });
  }
  if (!name || typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 255) {
    return res.status(400).json({ error: 'Institution Name (3-255 characters) is mandatory.' });
  }
  if (!contact_email || typeof contact_email !== 'string' || !contact_email.includes('@') || contact_email.length > 100) {
    return res.status(400).json({ error: 'A valid official contact email address is required.' });
  }
  if (contact_phone && (typeof contact_phone !== 'string' || contact_phone.trim().length > 20)) {
    return res.status(400).json({ error: 'Contact phone must not exceed 20 characters.' });
  }
  if (justification && (typeof justification !== 'string' || justification.trim().length > 1000)) {
    return res.status(400).json({ error: 'Justification must not exceed 1000 characters.' });
  }

  const existing = await db.prepare('SELECT id FROM institutions WHERE aicte_id = ?').get(aicte_id);
  if (existing) {
    return res.status(409).json({ error: `Institution with AICTE ID "${aicte_id}" is already active and registered in the portal.` });
  }

  const pending = await db.prepare('SELECT id FROM institution_requests WHERE aicte_id = ? AND status = "Pending"').get(aicte_id);
  if (pending) {
    return res.status(409).json({ error: `An onboarding application for AICTE ID "${aicte_id}" is already pending Council review.` });
  }

  try {
    const result = await executeMutation(`
      INSERT INTO institution_requests (aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type, justification, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
    `, [aicte_id, name, address || null, state || null, city || null, contact_person || null, contact_email, contact_phone || null, institution_type || 'Engineering', justification || null]);

    const createdReq = await db.prepare('SELECT * FROM institution_requests WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({
      message: 'Onboarding request submitted successfully. It is now awaiting Council Administrator approval.',
      request: createdReq
    });
  } catch (err: any) {
    return res.status(500).json(sanitizeError(err, 'Failed to submit onboarding request'));
  }
});

// GET /api/institutions/requests - List onboarding requests (Admin & Bureau Officer)
router.get('/requests', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
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

  const requests = await db.prepare(sql).all(...params);
  return res.json(requests);
});

// PATCH /api/institutions/requests/:id/approve - Approve onboarding request
router.patch('/requests/:id/approve', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const request = await db.prepare('SELECT * FROM institution_requests WHERE id = ?').get(req.params.id) as any;
  if (!request) {
    return res.status(404).json({ error: 'Onboarding request not found' });
  }
  if (request.status !== 'Pending') {
    return res.status(400).json({ error: `Request has already been ${request.status.toLowerCase()}` });
  }

  try {
    const newInstitution = await db.transaction(async (tx) => {
      const instResult = await tx.execute(`
        INSERT INTO institutions (aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        request.aicte_id, request.name, request.address, request.state, request.city,
        request.contact_person, request.contact_email, request.contact_phone, request.institution_type
      ]);

      await tx.execute(`
        UPDATE institution_requests 
        SET status = 'Approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [req.user!.userId, request.id]);

      await recordAuditLog(tx, {
        entity_type: 'Institution',
        entity_id: instResult.lastInsertRowid,
        action: 'Onboarding Approved',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({ aicte_id: request.aicte_id, name: request.name }),
        notes: `Approved ${request.name}`
      });

      return await tx.queryOne('SELECT * FROM institutions WHERE id = ?', [instResult.lastInsertRowid]);
    });

    return res.json({
      message: 'Institution onboarding request approved successfully.',
      institution: newInstitution
    });
  } catch (err: any) {
    return res.status(500).json(sanitizeError(err, 'Failed to approve onboarding request'));
  }
});

// PATCH /api/institutions/requests/:id/reject - Reject onboarding request
router.patch('/requests/:id/reject', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const { remarks } = req.body;
  if (!remarks) {
    return res.status(400).json({ error: 'Rejection reason/remarks are mandatory.' });
  }

  const request = await db.prepare('SELECT * FROM institution_requests WHERE id = ?').get(req.params.id) as any;
  if (!request) {
    return res.status(404).json({ error: 'Onboarding request not found' });
  }
  if (request.status !== 'Pending') {
    return res.status(400).json({ error: `Request has already been ${request.status.toLowerCase()}` });
  }

  try {
    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE institution_requests 
        SET status = 'Rejected', remarks = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [remarks, req.user!.userId, request.id]);

      await recordAuditLog(tx, {
        entity_type: 'InstitutionRequest',
        entity_id: request.id,
        action: 'Onboarding Rejected',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({ rejection_reason: remarks }),
        notes: remarks
      });
    });

    return res.json({ message: 'Institution onboarding request rejected.', remarks });
  } catch (err: any) {
    return res.status(500).json(sanitizeError(err, 'Failed to reject request'));
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

    const created = await db.prepare('SELECT * FROM institutions WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(created);
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'AICTE ID already registered' });
    }
    return res.status(500).json(sanitizeError(err, 'Failed to create institution'));
  }
});

export default router;
