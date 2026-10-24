import express from 'express';
import { db } from '../db/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { generateAlerts } from '../services/alertService';

const router = express.Router();

// GET /api/alerts
router.get('/', authenticate, (req: AuthRequest, res) => {
  const { is_resolved, alert_type, severity } = req.query;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  // Institution users can only view their own alerts
  if (req.user!.role === 'institution_user' && req.user!.institution_id) {
    whereClause += ' AND a.institution_id = ?';
    params.push(req.user!.institution_id);
  }

  if (is_resolved !== undefined && is_resolved !== '') {
    whereClause += ' AND a.is_resolved = ?';
    params.push(is_resolved === 'true' || is_resolved === '1' ? 1 : 0);
  }
  if (alert_type) {
    whereClause += ' AND a.alert_type = ?';
    params.push(alert_type);
  }
  if (severity) {
    whereClause += ' AND a.severity = ?';
    params.push(severity);
  }

  const alerts = db.prepare(`
    SELECT a.*, 
      i.name as institution_name, i.aicte_id,
      f.fdr_number, f.bank_name, f.deposit_amount, f.maturity_date,
      u.full_name as resolved_by_name
    FROM alerts a
    JOIN institutions i ON a.institution_id = i.id
    JOIN fdrs f ON a.fdr_id = f.id
    LEFT JOIN users u ON a.resolved_by = u.id
    ${whereClause}
    ORDER BY 
      CASE a.severity 
        WHEN 'Critical' THEN 1 
        WHEN 'High' THEN 2 
        WHEN 'Medium' THEN 3 
        ELSE 4 
      END ASC,
      a.created_at DESC
  `).all(...params) as any[];

  return res.json(alerts);
});

// PATCH /api/alerts/:id/resolve
router.patch('/:id/resolve', authenticate, requireRole(['admin', 'bureau_officer']), (req: AuthRequest, res) => {
  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id) as any;
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  db.prepare(`
    UPDATE alerts SET is_resolved = 1, resolved_by = ?, resolved_at = datetime('now')
    WHERE id = ?
  `).run(req.user!.userId, req.params.id);

  db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
    VALUES ('Alert', ?, 'Resolved', ?, ?)
  `).run(req.params.id, req.user!.userId, `Alert #${req.params.id} resolved by user`);

  return res.json({ success: true, message: 'Alert resolved successfully' });
});

// POST /api/alerts/generate - manual trigger
router.post('/generate', authenticate, requireRole(['admin', 'bureau_officer']), (_req: AuthRequest, res) => {
  const count = generateAlerts();
  return res.json({ success: true, newAlerts: count });
});

export default router;
