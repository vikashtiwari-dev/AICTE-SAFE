import express from 'express';
import { db } from '../db/database';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/reports/summary - top-level dashboard metrics with fail-closed institution isolation
router.get('/summary', authenticate, (req: AuthRequest, res) => {
  let instFilter = '';
  const params: any[] = [];

  if (req.user!.role === 'institution_user') {
    if (!req.user!.institution_id) {
      return res.status(403).json({ error: 'Access denied: User is not linked to any registered institution.' });
    }
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
  if (req.user!.role === 'institution_user') {
    alertFilter += ' AND institution_id = ?';
    alertParams.push(req.user!.institution_id);
  }
  const pendingAlerts = db.prepare(`SELECT COUNT(*) as cnt FROM alerts ${alertFilter}`).get(...alertParams) as any;

  // Pending release requests count
  let relFilter = "WHERE status IN ('Pending', 'Under Review', 'Submitted')";
  const relParams: any[] = [];
  if (req.user!.role === 'institution_user') {
    relFilter += ' AND institution_id = ?';
    relParams.push(req.user!.institution_id);
  }
  const pendingReleases = db.prepare(`SELECT COUNT(*) as cnt FROM release_requests ${relFilter}`).get(...relParams) as any;

  return res.json({
    ...totals,
    unresolved_alerts_count: pendingAlerts.cnt || 0,
    pending_releases_count: pendingReleases.cnt || 0,
  });
});

// GET /api/reports/status-breakdown
router.get('/status-breakdown', authenticate, (req: AuthRequest, res) => {
  let instFilter = '';
  const params: any[] = [];
  if (req.user!.role === 'institution_user') {
    if (!req.user!.institution_id) {
      return res.status(403).json({ error: 'Access denied: User is not linked to any registered institution.' });
    }
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
  if (req.user!.role === 'institution_user') {
    if (!req.user!.institution_id) {
      return res.status(403).json({ error: 'Access denied: User is not linked to any registered institution.' });
    }
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
router.get('/institution-wise', authenticate, (req: AuthRequest, res) => {
  let whereClause = '';
  const params: any[] = [];

  if (req.user!.role === 'institution_user') {
    if (!req.user!.institution_id) {
      return res.status(403).json({ error: 'Access denied: User is not linked to any registered institution.' });
    }
    whereClause = 'WHERE i.id = ?';
    params.push(req.user!.institution_id);
  }

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
    ${whereClause}
    GROUP BY i.id
    ORDER BY total_deposit_amount DESC
  `).all(...params) as any[];

  return res.json(data);
});

// GET /api/reports/audit-log
router.get('/audit-log', authenticate, (req: AuthRequest, res) => {
  const { entity_type, limit = '50' } = req.query;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (req.user!.role === 'institution_user') {
    if (!req.user!.institution_id) {
      return res.status(403).json({ error: 'Access denied: User is not linked to any registered institution.' });
    }
    whereClause += ' AND a.institution_id = ?';
    params.push(req.user!.institution_id);
  }

  if (entity_type) {
    whereClause += ' AND a.entity_type = ?';
    params.push(entity_type);
  }

  const logs = db.prepare(`
    SELECT a.*, u.full_name as changed_by_name, u.role as changed_by_role
    FROM audit_log a
    LEFT JOIN users u ON a.user_id = u.id
    ${whereClause}
    ORDER BY a.timestamp DESC
    LIMIT ?
  `).all(...params, parseInt(limit as string)) as any[];

  return res.json(logs);
});

// GET /api/reports/macro-analytics - Macro-level Cash Flow & Bank Distribution
router.get('/macro-analytics', authenticate, (req: AuthRequest, res) => {
  let instFilter = '';
  const params: any[] = [];
  if (req.user!.role === 'institution_user') {
    if (!req.user!.institution_id) {
      return res.status(403).json({ error: 'Access denied: User is not linked to any registered institution.' });
    }
    instFilter = 'WHERE institution_id = ?';
    params.push(req.user!.institution_id);
  }

  const bankDistribution = db.prepare(`
    SELECT bank_name, 
      COUNT(*) as count, 
      COALESCE(SUM(deposit_amount), 0) as total_amount
    FROM fdrs
    WHERE status NOT IN ('Cancelled', 'Released')
    ${instFilter ? 'AND ' + instFilter.replace('WHERE ', '') : ''}
    GROUP BY bank_name
    ORDER BY total_amount DESC
  `).all(...params);

  // Total locked-in capital
  const totalLocked = db.prepare(`
    SELECT COALESCE(SUM(deposit_amount), 0) as locked_capital, COUNT(*) as active_instruments
    FROM fdrs
    WHERE status IN ('Active', 'Expiring Soon')
    ${instFilter ? 'AND ' + instFilter.replace('WHERE ', '') : ''}
  `).get(...params) as any;

  return res.json({
    bankDistribution,
    totalLockedCapital: totalLocked ? totalLocked.locked_capital : 0,
    activeInstruments: totalLocked ? totalLocked.active_instruments : 0,
  });
});

// GET /api/reports/compliance-health/:id - Institution Health Score & APH Penalty
router.get('/compliance-health/:id', authenticate, (req: AuthRequest, res) => {
  let targetId = req.params.id;
  if (targetId === 'current' || targetId === 'me' || !targetId) {
    targetId = (req.user?.institution_id || 1).toString();
  }

  // Institution isolation
  if (req.user!.role === 'institution_user') {
    if (!req.user!.institution_id || Number(targetId) !== Number(req.user!.institution_id)) {
      return res.status(403).json({ error: 'Access denied: You can only check compliance health for your registered institution.' });
    }
  }

  const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(targetId) as any;
  if (!inst) return res.status(404).json({ error: 'Institution not found' });
  const instId = inst.id;

  const fdrs = db.prepare('SELECT * FROM fdrs WHERE institution_id = ?').all(instId) as any[];
  
  let score = 100;
  let penaltyAmount = 0;
  const infractions: string[] = [];
  const actionItems: string[] = [];

  for (const fdr of fdrs) {
    if (fdr.status === 'Matured') {
      score -= 25;
      penaltyAmount += 50000; // ₹50k / overdue instrument per APH 규
      infractions.push(`Overdue Instrument ${fdr.fdr_number} past maturity date without council renewal.`);
      actionItems.push(`Initiate immediate renewal receipt upload for ${fdr.fdr_number} to abate statutory penalty.`);
    } else if (fdr.status === 'Expiring Soon') {
      score -= 10;
      actionItems.push(`Instrument ${fdr.fdr_number} maturing in under 30 days. Contact issuing bank branch.`);
    }

    if (fdr.verification_status === 'Discrepancy') {
      score -= 35;
      infractions.push(`Bank scrutiny discrepancy flagged on ${fdr.fdr_number}. Core verification mismatch.`);
      actionItems.push(`Submit clarification in Dispute Module regarding ${fdr.fdr_number}.`);
    }
  }

  score = Math.max(0, Math.min(100, score));

  let grade = 'A+ (Exemplary)';
  let aphStatus = 'Approved & Clear';
  if (score < 50) {
    grade = 'C (Deficient)';
    aphStatus = 'Under Scrutiny - Risk of Intake Reduction';
  } else if (score < 80) {
    grade = 'B (Action Required)';
    aphStatus = 'Conditional Approval Pending Rectification';
  }

  return res.json({
    institution_id: inst.id,
    institution_name: inst.name,
    health_score: score,
    grade,
    aph_status: aphStatus,
    statutory_penalty_amount: penaltyAmount,
    infractions,
    action_items: actionItems,
    evaluated_at: new Date().toISOString()
  });
});

export default router;
