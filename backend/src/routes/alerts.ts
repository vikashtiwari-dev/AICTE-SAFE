import express from 'express';
import { db, executeMutation } from '../db/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { generateAlerts } from '../services/alertService';

const router = express.Router();

// GET /api/alerts/cron-check or POST /api/alerts/cron-check - Vercel Scheduled Cron Job & External Trigger
const handleCronCheck = async (req: express.Request, res: express.Response) => {
  // Verify Vercel Cron header or CRON_SECRET if configured, otherwise allow authenticated/internal invoke
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers['x-vercel-cron'] === '1';

  if (cronSecret && !isVercelCron) {
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized: Valid CRON_SECRET required for automated scheduler execution.' });
    }
  }

  try {
    const alertsCreated = generateAlerts();
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      job: 'DAILY_FDR_MATURITY_AND_COMPLIANCE_AUDIT',
      new_alerts_created: alertsCreated,
      status: 'IDEMPOTENT_SCAN_COMPLETED',
      notes: 'Monitors 90/30/10-day maturity windows, discrepancy flags, overdue lock-in violations, and missing statutory records.'
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Cron execution failed', details: err.message });
  }
};

router.get('/cron-check', handleCronCheck);
router.post('/cron-check', handleCronCheck);

// GET /api/alerts - List with strict institution isolation
router.get('/', authenticate, (req: AuthRequest, res) => {
  const { is_resolved, alert_type, severity } = req.query;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  // Strict Fail-Closed Isolation for Institution Users
  if (req.user!.role === 'institution_user') {
    if (!req.user!.institution_id) {
      return res.status(403).json({ error: 'Access denied: User is not associated with any registered institution.' });
    }
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

// PATCH /api/alerts/:id/resolve - Resolve alert with audit trail and cloud persistence
router.patch('/:id/resolve', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id) as any;
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  try {
    await executeMutation(`
      UPDATE alerts SET is_resolved = 1, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [req.user!.userId, req.params.id]);

    await executeMutation(`
      INSERT INTO audit_log (entity_type, entity_id, action, changed_by, new_value, notes)
      VALUES ('Alert', ?, 'Resolved', ?, ?, ?)
    `, [req.params.id, req.user!.userId, JSON.stringify({ is_resolved: 1, resolved_by: req.user!.userId }), `Alert #${req.params.id} resolved`]);

    return res.json({ success: true, message: 'Alert marked resolved in national compliance registry.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to resolve alert', details: err.message });
  }
});

// POST /api/alerts/generate - Manual trigger
router.post('/generate', authenticate, requireRole(['admin', 'bureau_officer']), (_req: AuthRequest, res) => {
  const count = generateAlerts();
  return res.json({ success: true, newAlerts: count });
});

export default router;
