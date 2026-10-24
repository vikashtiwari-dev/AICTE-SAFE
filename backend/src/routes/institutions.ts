import express from 'express';
import { db } from '../db/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/institutions - list with summary statistics
router.get('/', authenticate, (_req: AuthRequest, res) => {
  const institutions = db.prepare(`
    SELECT i.*,
      COUNT(f.id) as total_fdrs,
      COALESCE(SUM(CASE WHEN f.status NOT IN ('Released', 'Cancelled') THEN f.deposit_amount ELSE 0 END), 0) as total_deposit_amount,
      SUM(CASE WHEN f.status = 'Active' THEN 1 ELSE 0 END) as active_fdrs,
      SUM(CASE WHEN f.status = 'Expiring Soon' THEN 1 ELSE 0 END) as expiring_soon_fdrs,
      SUM(CASE WHEN f.verification_status = 'Discrepancy' THEN 1 ELSE 0 END) as discrepancy_count
    FROM institutions i
    LEFT JOIN fdrs f ON i.id = f.institution_id
    GROUP BY i.id
    ORDER BY i.name ASC
  `).all() as any[];

  return res.json(institutions);
});

// GET /api/institutions/:id
router.get('/:id', authenticate, (req: AuthRequest, res) => {
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

// POST /api/institutions (admin only)
router.post('/', authenticate, requireRole(['admin']), (req: AuthRequest, res) => {
  const { aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type } = req.body;

  if (!aicte_id || !name) {
    return res.status(400).json({ error: 'AICTE ID and institution name are required' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO institutions (aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(aicte_id, name, address || null, state || null, city || null, contact_person || null, contact_email || null, contact_phone || null, institution_type || 'Engineering');

    return res.status(201).json(db.prepare('SELECT * FROM institutions WHERE id = ?').get(result.lastInsertRowid));
  } catch (err: any) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'AICTE ID already registered' });
    }
    return res.status(500).json({ error: 'Failed to create institution', details: err.message });
  }
});

// PUT /api/institutions/:id (admin only)
router.put('/:id', authenticate, requireRole(['admin']), (req: AuthRequest, res) => {
  const { name, address, state, city, contact_person, contact_email, contact_phone, institution_type } = req.body;

  db.prepare(`
    UPDATE institutions SET name = ?, address = ?, state = ?, city = ?,
      contact_person = ?, contact_email = ?, contact_phone = ?, institution_type = ?
    WHERE id = ?
  `).run(name, address || null, state || null, city || null, contact_person || null, contact_email || null, contact_phone || null, institution_type || 'Engineering', req.params.id);

  return res.json(db.prepare('SELECT * FROM institutions WHERE id = ?').get(req.params.id));
});

export default router;
