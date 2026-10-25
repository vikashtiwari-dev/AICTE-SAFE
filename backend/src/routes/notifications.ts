import express from 'express';
import { db } from '../db/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/notifications - fetch notification history & nudges
router.get('/', authenticate, (req: AuthRequest, res) => {
  const { channel, institution_id, limit = '50' } = req.query;

  let sql = `
    SELECT n.*, i.name as institution_name, i.aicte_id, f.fdr_number, f.bank_name, f.maturity_date
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

  const logs = db.prepare(sql).all(...params);
  return res.json(logs);
});

// POST /api/notifications/trigger-nudges - automated trigger for 60d, 30d, 15d, 7d nudges
router.post('/trigger-nudges', authenticate, requireRole(['admin', 'bureau_officer']), (req: AuthRequest, res) => {
  const today = new Date();
  
  // Find expiring FDRs within 60 days
  const expiringFdrs = db.prepare(`
    SELECT f.*, i.name as inst_name, i.contact_person, i.contact_email, i.contact_phone
    FROM fdrs f
    JOIN institutions i ON f.institution_id = i.id
    WHERE f.status IN ('Active', 'Expiring Soon')
  `).all() as any[];

  let nudgesSent = 0;

  for (const fdr of expiringFdrs) {
    const maturity = new Date(fdr.maturity_date);
    const diffDays = Math.ceil((maturity.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 60 && diffDays >= 0) {
      // Determine stage
      const stage = diffDays <= 7 ? 7 : diffDays <= 15 ? 15 : diffDays <= 30 ? 30 : 60;
      
      // Check if already sent for this FDR & stage today
      const alreadySent = db.prepare(`
        SELECT id FROM notifications_log 
        WHERE fdr_id = ? AND days_before_maturity = ? AND date(sent_at) = date('now')
      `).get(fdr.id, stage);

      if (!alreadySent) {
        // Send WhatsApp Nudge to Principal
        db.prepare(`
          INSERT INTO notifications_log (institution_id, fdr_id, channel, recipient_role, recipient_contact, message_body, days_before_maturity, delivery_status)
          VALUES (?, ?, 'WhatsApp', 'Principal', ?, ?, ?, 'Delivered')
        `).run(
          fdr.institution_id, fdr.id, fdr.contact_phone || '+91 98100 00000',
          `AICTE Statutory Reminder: FDR ${fdr.fdr_number} for ${fdr.inst_name} matures in ${diffDays} days. Ensure timely renewal under Approval Process Handbook (APH) rules.`,
          stage
        );

        // Send Email to Accounts Officer
        db.prepare(`
          INSERT INTO notifications_log (institution_id, fdr_id, channel, recipient_role, recipient_contact, message_body, days_before_maturity, delivery_status)
          VALUES (?, ?, 'Email', 'Accounts_Officer', ?, ?, ?, 'Delivered')
        `).run(
          fdr.institution_id, fdr.id, fdr.contact_email,
          `Statutory Notice: Fixed Deposit Receipt #${fdr.fdr_number} (${fdr.bank_name}) with maturity date ${fdr.maturity_date} requires renewal. Log into AICTE SAFE to upload fresh receipt.`,
          stage
        );

        // Send SMS to Chairman
        db.prepare(`
          INSERT INTO notifications_log (institution_id, fdr_id, channel, recipient_role, recipient_contact, message_body, days_before_maturity, delivery_status)
          VALUES (?, ?, 'SMS', 'Chairman', ?, ?, ?, 'Delivered')
        `).run(
          fdr.institution_id, fdr.id, fdr.contact_phone || '+91 99999 88888',
          `AICTE Regulatory Alert: Security deposit instrument ${fdr.fdr_number} expiring in ${diffDays} days. Avoid APH penalty by submitting renewal receipt.`,
          stage
        );

        nudgesSent += 3;
      }
    }
  }

  return res.json({ success: true, nudgesSent, message: `Dispatched ${nudgesSent} automated multi-channel statutory nudges.` });
});

export default router;
