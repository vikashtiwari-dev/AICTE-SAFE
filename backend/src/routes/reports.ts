import express from 'express';
import { db } from '../db/database';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/reports/summary - top-level dashboard metrics
router.get('/summary', authenticate, (req: AuthRequest, res) => {
  let instFilter = '';
  const params: any[] = [];

  if (req.user!.role === 'institution_user' && req.user!.institution_id) {
    instFilter = 'WHERE institution_id = ?';
    params.push(req.user!.institution_id);
  }

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_fdrs,
      COALESCE(SUM(deposit_amount), 0) as total_amount,
      SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active_count,
      SUM(CASE WHEN status = 'Expiring Soon' THEN 1 ELSE 0 END) as expiring_soon_count,
      SUM(CASE WHEN status = 'Matured' THEN 1 ELSE 0 END) as matured_count,
      SUM(CASE WHEN status = 'Renewed' THEN 1 ELSE 0 END) as renewed_count,
      SUM(CASE WHEN status = 'Released' THEN 1 ELSE 0 END) as released_count,
      SUM(CASE WHEN status = 'Pending Verification' THEN 1 ELSE 0 END) as pending_verification_count,
      SUM(CASE WHEN verification_status = 'Discrepancy' THEN 1 ELSE 0 END) as discrepancy_count
    FROM fdrs
    ${instFilter}
  `).get(...params) as any;

  // Unresolved alerts count
  let alertFilter = 'WHERE is_resolved = 0';
  const alertParams: any[] = [];
  if (req.user!.role === 'institution_user' && req.user!.institution_id) {
    alertFilter += ' AND institution_id = ?';
    alertParams.push(req.user!.institution_id);
  }
  const pendingAlerts = db.prepare(`SELECT COUNT(*) as cnt FROM alerts ${alertFilter}`).get(...alertParams) as any;

  // Pending release requests count
  let relFilter = "WHERE status IN ('Pending', 'Under Review')";
  const relParams: any[] = [];
  if (req.user!.role === 'institution_user' && req.user!.institution_id) {
    relFilter += ' AND institution_id = ?';
    relParams.push(req.user!.institution_id);
  }
  const pendingReleases = db.prepare(`SELECT COUNT(*) as cnt FROM release_requests ${relFilter}`).get(...relParams) as any;

  return res.json({
    ...totals,
    unresolved_alerts_count: pendingAlerts.cnt,
    pending_releases_count: pendingReleases.cnt,
  });
});

// GET /api/reports/status-breakdown
router.get('/status-breakdown', authenticate, (req: AuthRequest, res) => {
  let instFilter = '';
  const params: any[] = [];
  if (req.user!.role === 'institution_user' && req.user!.institution_id) {
    instFilter = 'WHERE institution_id = ?';
    params.push(req.user!.institution_id);
  }

  const statusBreakdown = db.prepare(`
    SELECT status, COUNT(*) as count, COALESCE(SUM(deposit_amount), 0) as total_amount
    FROM fdrs
    ${instFilter}
    GROUP BY status
  `).all(...params) as any[];

  const typeBreakdown = db.prepare(`
    SELECT deposit_type, COUNT(*) as count, COALESCE(SUM(deposit_amount), 0) as total_amount
    FROM fdrs
    ${instFilter}
    GROUP BY deposit_type
  `).all(...params) as any[];

  return res.json({ statusBreakdown, typeBreakdown });
});

// GET /api/reports/expiring - FDRs expiring in 30/60/90 days
router.get('/expiring', authenticate, (req: AuthRequest, res) => {
  let instFilter = '';
  const params: any[] = [];
  if (req.user!.role === 'institution_user' && req.user!.institution_id) {
    instFilter = 'AND f.institution_id = ?';
    params.push(req.user!.institution_id);
  }

  const expiringFDRs = db.prepare(`
    SELECT f.*, i.name as institution_name, i.aicte_id,
      CAST(julianday(f.maturity_date) - julianday('now') AS INTEGER) as days_to_maturity
    FROM fdrs f
    JOIN institutions i ON f.institution_id = i.id
    WHERE f.status NOT IN ('Released', 'Cancelled')
      AND julianday(f.maturity_date) >= julianday('now')
      AND julianday(f.maturity_date) <= julianday('now', '+90 days')
      ${instFilter}
    ORDER BY f.maturity_date ASC
  `).all(...params) as any[];

  return res.json(expiringFDRs);
});

// GET /api/reports/institution-wise
router.get('/institution-wise', authenticate, (_req: AuthRequest, res) => {
  const data = db.prepare(`
    SELECT 
      i.id, i.aicte_id, i.name, i.state, i.institution_type,
      COUNT(f.id) as total_fdrs,
      COALESCE(SUM(f.deposit_amount), 0) as total_deposit_amount,
      SUM(CASE WHEN f.status = 'Active' THEN 1 ELSE 0 END) as active_count,
      SUM(CASE WHEN f.status = 'Expiring Soon' THEN 1 ELSE 0 END) as expiring_count,
      SUM(CASE WHEN f.status = 'Matured' THEN 1 ELSE 0 END) as matured_count,
      SUM(CASE WHEN f.verification_status = 'Discrepancy' THEN 1 ELSE 0 END) as discrepancy_count
    FROM institutions i
    LEFT JOIN fdrs f ON i.id = f.institution_id
    GROUP BY i.id
    ORDER BY total_deposit_amount DESC
  `).all() as any[];

  return res.json(data);
});

// GET /api/reports/audit-log
router.get('/audit-log', authenticate, (req: AuthRequest, res) => {
  const { entity_type, limit = '50' } = req.query;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (entity_type) {
    whereClause += ' AND a.entity_type = ?';
    params.push(entity_type);
  }

  const logs = db.prepare(`
    SELECT a.*, u.full_name as changed_by_name, u.role as changed_by_role
    FROM audit_log a
    LEFT JOIN users u ON a.changed_by = u.id
    ${whereClause}
    ORDER BY a.changed_at DESC
    LIMIT ?
  `).all(...params, parseInt(limit as string)) as any[];

  return res.json(logs);
});

export default router;
