import express from 'express';
import jwt from 'jsonwebtoken';
import { db, recordAuditLog } from '../db/database';
import { authenticate, requireRole, AuthRequest, resolveJWTSecret } from '../middleware/auth';
import { generateAlerts, dispatchStatutoryNudges, getAlertConfig, saveAlertConfig, DEFAULT_ALERT_CONFIG } from '../services/alertService';

const router = express.Router();

// GET /api/alerts/cron-check or POST /api/alerts/cron-check - Vercel Scheduled Cron Job & External Trigger
const handleCronCheck = async (req: express.Request, res: express.Response) => {
  const cronSecret = process.env.CRON_SECRET;
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

  // 1. Fail closed in production if CRON_SECRET is not configured or insufficiently strong (< 16 chars)
  if (isProduction && (!cronSecret || cronSecret.trim().length < 16)) {
    console.error('🚨 [Security Violation] CRON_SECRET is not configured or insufficiently strong (min 16 chars) in production.');
    return res.status(500).json({
      error: 'CRON_AUTHENTICATION_NOT_CONFIGURED',
      message: 'Fail-closed security: Automated scheduler trigger requires a configured CRON_SECRET in production.'
    });
  }

  // 2. Validate Authorization header: must match Bearer <CRON_SECRET> or valid Admin/Bureau Officer JWT
  const authHeader = req.headers.authorization;
  let isAuthorized = false;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    isAuthorized = true;
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const jwtSecret = resolveJWTSecret();
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, jwtSecret) as any;
      if (decoded && (decoded.role === 'admin' || decoded.role === 'bureau_officer')) {
        isAuthorized = true;
      }
    } catch (_) {
      // Invalid JWT or expired
    }
  }

  if (!isAuthorized) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required. Scheduled trigger requires valid Bearer CRON_SECRET or authorized Administrator JWT.'
    });
  }

  try {
    const alertsCreated = await generateAlerts();
    const nudgesDispatched = await dispatchStatutoryNudges();
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      job: 'DAILY_FDR_MATURITY_AND_COMPLIANCE_AUDIT',
      new_alerts_created: alertsCreated,
      nudges_dispatched: nudgesDispatched,
      status: 'IDEMPOTENT_SCAN_COMPLETED',
      notes: 'Monitors 90/30/10-day maturity windows, discrepancy flags, overdue lock-in violations, and multi-channel statutory reminders.'
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Cron execution failed', details: err.message });
  }
};

router.get('/cron-check', handleCronCheck);
router.post('/cron-check', handleCronCheck);

// GET /api/alerts - List with strict institution isolation
router.get('/', authenticate, async (req: AuthRequest, res) => {
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

  const alerts = await db.prepare(`
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
  const alert = await db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id) as any;
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  try {
    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE alerts SET is_resolved = 1, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [req.user!.userId, req.params.id]);

      await recordAuditLog(tx, {
        entity_type: 'Alert',
        entity_id: Number(req.params.id),
        action: 'Resolved',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({ is_resolved: 1, resolved_by: req.user!.userId }),
        notes: `Alert #${req.params.id} resolved`
      });
    });

    return res.json({ success: true, message: 'Alert marked resolved in national compliance registry.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to resolve alert', details: err.message });
  }
});

// GET /api/alerts/settings - Retrieve current maturity horizons and statutory escalation configuration
router.get('/settings', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  try {
    const config = await getAlertConfig();
    return res.json({
      config,
      default_config: DEFAULT_ALERT_CONFIG,
      description: 'Configurable maturity reminder horizons and statutory escalation overdue windows'
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve alert settings' });
  }
});

// PUT /api/alerts/settings - Update maturity horizons (Administrator only)
router.put('/settings', authenticate, requireRole(['admin']), async (req: AuthRequest, res) => {
  const { criticalMaturityDays, highMaturityDays, mediumMaturityDays, statutoryEscalationOverdueDays } = req.body;

  if (criticalMaturityDays !== undefined && (isNaN(Number(criticalMaturityDays)) || Number(criticalMaturityDays) < 1 || Number(criticalMaturityDays) > 30)) {
    return res.status(400).json({ error: 'criticalMaturityDays must be between 1 and 30 days.' });
  }
  if (highMaturityDays !== undefined && (isNaN(Number(highMaturityDays)) || Number(highMaturityDays) < 5 || Number(highMaturityDays) > 90)) {
    return res.status(400).json({ error: 'highMaturityDays must be between 5 and 90 days.' });
  }
  if (mediumMaturityDays !== undefined && (isNaN(Number(mediumMaturityDays)) || Number(mediumMaturityDays) < 15 || Number(mediumMaturityDays) > 180)) {
    return res.status(400).json({ error: 'mediumMaturityDays must be between 15 and 180 days.' });
  }
  if (statutoryEscalationOverdueDays !== undefined && (isNaN(Number(statutoryEscalationOverdueDays)) || Number(statutoryEscalationOverdueDays) < 1 || Number(statutoryEscalationOverdueDays) > 120)) {
    return res.status(400).json({ error: 'statutoryEscalationOverdueDays must be between 1 and 120 days.' });
  }

  try {
    const saved = await saveAlertConfig({
      criticalMaturityDays,
      highMaturityDays,
      mediumMaturityDays,
      statutoryEscalationOverdueDays,
    }, req.user!.userId);

    // Record change in audit trail
    await recordAuditLog(db, {
      entity_type: 'SystemSetting',
      entity_id: 0,
      action: 'Alert Thresholds Updated',
      changed_by: req.user!.userId,
      new_value: JSON.stringify(saved),
      notes: 'Administrator updated maturity alert thresholds'
    });

    return res.json({
      success: true,
      config: saved,
      message: 'Maturity alert horizon thresholds and statutory escalation settings successfully updated.'
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update alert settings' });
  }
});

// POST /api/alerts/generate - Manual trigger
router.post('/generate', authenticate, requireRole(['admin', 'bureau_officer']), async (_req: AuthRequest, res) => {
  try {
    const count = await generateAlerts();
    return res.json({ success: true, newAlerts: count });
  } catch (err: any) {
    return res.status(500).json({ error: 'Alert generation failed' });
  }
});

export default router;
