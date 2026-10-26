import express from 'express';
import { db, executeMutation } from '../db/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/disputes - list all dispute tickets with strict institution isolation
router.get('/', authenticate, async (req: AuthRequest, res) => {
  const { status, institution_id } = req.query;
  let sql = `
    SELECT d.*, 
      f.fdr_number, f.bank_name, f.deposit_amount,
      i.name as institution_name, i.aicte_id,
      u.full_name as creator_name
    FROM dispute_tickets d
    JOIN fdrs f ON d.fdr_id = f.id
    JOIN institutions i ON d.institution_id = i.id
    LEFT JOIN users u ON d.created_by = u.id
    WHERE 1=1
  `;
  const params: any[] = [];

  // Strict Fail-Closed Isolation
  if (req.user!.role === 'institution_user') {
    if (!req.user!.institution_id) {
      return res.status(403).json({ error: 'Access denied: User is not associated with any registered institution.' });
    }
    sql += ' AND d.institution_id = ?';
    params.push(req.user!.institution_id);
  } else if (institution_id) {
    sql += ' AND d.institution_id = ?';
    params.push(institution_id);
  }

  if (status) {
    sql += ' AND d.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY d.created_at DESC';

  const tickets = await db.prepare(sql).all(...params);
  return res.json(tickets);
});

// GET /api/disputes/:id - get ticket with messages thread
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  const ticket = await db.prepare(`
    SELECT d.*, 
      f.fdr_number, f.bank_name, f.deposit_amount, f.verification_status, f.verification_notes,
      i.name as institution_name, i.aicte_id, i.contact_email, i.contact_person
    FROM dispute_tickets d
    JOIN fdrs f ON d.fdr_id = f.id
    JOIN institutions i ON d.institution_id = i.id
    WHERE d.id = ?
  `).get(req.params.id) as any;

  if (!ticket) {
    return res.status(404).json({ error: 'Dispute ticket not found' });
  }

  // Strict ownership check
  if (req.user!.role === 'institution_user' && req.user!.institution_id !== ticket.institution_id) {
    return res.status(403).json({ error: 'Access denied: You do not possess clearance for this dispute ticket.' });
  }

  const messages = await db.prepare(`
    SELECT * FROM dispute_messages
    WHERE ticket_id = ? OR dispute_id = ?
    ORDER BY created_at ASC
  `).all(req.params.id, req.params.id);

  return res.json({ ticket, messages });
});

// POST /api/disputes - Open a dispute ticket with cloud persistence
router.post('/', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const { fdr_id, title, discrepancy_details, priority = 'High' } = req.body;

  if (!fdr_id || !title || !discrepancy_details) {
    return res.status(400).json({ error: 'FDR ID, title, and discrepancy details are required' });
  }

  const fdr = await db.prepare('SELECT * FROM fdrs WHERE id = ?').get(fdr_id) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  try {
    const ticketId = await db.transaction(async (tx) => {
      const result = await tx.execute(`
        INSERT INTO dispute_tickets (fdr_id, institution_id, title, discrepancy_details, status, priority, created_by)
        VALUES (?, ?, ?, ?, 'Open', ?, ?)
      `, [fdr.id, fdr.institution_id, title, discrepancy_details, priority, req.user!.userId]);

      const tId = result.lastInsertRowid;

      // Insert initial message
      await tx.execute(`
        INSERT INTO dispute_messages (ticket_id, dispute_id, sender_id, sender_role, sender_name, message)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [tId, tId, req.user!.userId, req.user!.role, 'Council Regulation Officer', discrepancy_details]);

      // Update FDR status to Discrepancy
      await tx.execute(`
        UPDATE fdrs SET verification_status = 'Discrepancy', verification_notes = ? WHERE id = ?
      `, [title, fdr.id]);

      // Add alert
      await tx.execute(`
        INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message)
        VALUES (?, ?, 'Discrepancy', 'Critical', ?)
      `, [fdr.id, fdr.institution_id, `Dispute Opened: ${title}`]);

      return tId;
    });

    return res.status(201).json({ id: ticketId, message: 'Dispute ticket opened and recorded in cloud registry.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to open dispute ticket', details: err.message });
  }
});

// POST /api/disputes/:id/messages - Add clarification message with ownership check
router.post('/:id/messages', authenticate, async (req: AuthRequest, res) => {
  const { message, attachment_url } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  const ticket = await db.prepare('SELECT * FROM dispute_tickets WHERE id = ?').get(req.params.id) as any;
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  // Ownership verification for institution user
  if (req.user!.role === 'institution_user' && ticket.institution_id !== req.user!.institution_id) {
    return res.status(403).json({ error: 'Forbidden: You cannot reply to a dispute for another institution.' });
  }

  const senderName = req.user!.role === 'institution_user' ? 'Institution Accounts Officer' : 'Council Regulation Officer';

  try {
    await db.transaction(async (tx) => {
      await tx.execute(`
        INSERT INTO dispute_messages (ticket_id, dispute_id, sender_id, sender_role, sender_name, message, attachment_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [ticket.id, ticket.id, req.user!.userId, req.user!.role, senderName, message, attachment_url || null]);

      // If institution responded, mark ticket as 'Clarification Submitted'
      if (req.user!.role === 'institution_user' && ticket.status === 'Open') {
        await tx.execute('UPDATE dispute_tickets SET status = \'Clarification Submitted\' WHERE id = ?', [ticket.id]);
      }
    });

    return res.status(201).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to post message', details: err.message });
  }
});

// PATCH /api/disputes/:id/resolve - Resolve dispute
router.patch('/:id/resolve', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const ticket = await db.prepare('SELECT * FROM dispute_tickets WHERE id = ?').get(req.params.id) as any;
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  try {
    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE dispute_tickets 
        SET status = 'Resolved', resolved_at = CURRENT_TIMESTAMP, resolved_by = ?
        WHERE id = ?
      `, [req.user!.userId, ticket.id]);

      // Update FDR verification status back to Verified
      await tx.execute(`
        UPDATE fdrs SET verification_status = 'Verified', verification_notes = 'Dispute resolved and verified by Council Regulation Bureau'
        WHERE id = ?
      `, [ticket.fdr_id]);

      // Resolve active discrepancy alert for this FDR
      await tx.execute(`
        UPDATE alerts SET is_resolved = 1, resolved_at = CURRENT_TIMESTAMP, resolved_by = ?
        WHERE fdr_id = ? AND alert_type = 'Discrepancy'
      `, [req.user!.userId, ticket.fdr_id]);
    });

    return res.json({ success: true, message: 'Dispute marked as Resolved and FDR verification restored.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to resolve dispute', details: err.message });
  }
});

export default router;
