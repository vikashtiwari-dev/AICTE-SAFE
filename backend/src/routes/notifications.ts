import express from 'express';
import { db } from '../db/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { dispatchStatutoryNudges, retryFailedNotifications } from '../services/alertService';
import { sanitizeError, verificationLimiter } from '../middleware/security';

const router = express.Router();

// GET /api/notifications - fetch notification history & nudges
router.get('/', authenticate, async (req: AuthRequest, res) => {
  const { channel, institution_id, limit = '50' } = req.query;

  let sql = `
    SELECT n.*, n.days_before_maturity as trigger_days,
           i.name as institution_name, i.aicte_id,
           f.fdr_number, f.bank_name, f.maturity_date
    FROM notifications_log n
    JOIN institutions i ON n.institution_id = i.id
    JOIN fdrs f ON n.fdr_id = f.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (req.user!.role === 'institution_user' && req.user!.institution_id) {
    sql += ' AND n.institution_id = ?';
    params.push(req.user!.institution_id);
  } else if (institution_id) {
    sql += ' AND n.institution_id = ?';
    params.push(institution_id);
  }

  if (channel) {
    sql += ' AND n.channel = ?';
    params.push(channel);
  }

  sql += ' ORDER BY n.sent_at DESC LIMIT ?';
  params.push(parseInt(limit as string));

  const logs = await db.prepare(sql).all(...params);
  return res.json(logs);
});

// POST /api/notifications/trigger-nudges - automated trigger for 60d, 30d, 15d, 7d nudges
router.post('/trigger-nudges', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  try {
    const nudgesProcessed = await dispatchStatutoryNudges();
    return res.json({
      success: true,
      nudgesSent: nudgesProcessed,
      message: `Statutory multi-channel maturity scan completed. Processed ${nudgesProcessed} channel notifications (live gateways dispatched where configured; unverified contacts flagged).`
    });
  } catch (err: any) {
    return res.status(500).json(sanitizeError(err, 'Failed to dispatch statutory nudges'));
  }
});

// POST /api/notifications/retry-failed - Retry failed statutory notifications (Rate limited)
router.post('/retry-failed', verificationLimiter, authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  try {
    const limit = req.body.limit ? parseInt(req.body.limit, 10) : 25;
    const retryResult = await retryFailedNotifications(limit);
    return res.json({
      success: true,
      ...retryResult,
      message: `Processed ${retryResult.total_retried} failed notifications. Successfully delivered: ${retryResult.succeeded}, Pending/Permanent: ${retryResult.failed}.`
    });
  } catch (err: any) {
    return res.status(500).json(sanitizeError(err, 'Failed to retry notifications'));
  }
});

export default router;
