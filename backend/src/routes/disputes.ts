import express from 'express';
import { db } from '../db/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/disputes - list all dispute tickets
router.get('/', authenticate, (req: AuthRequest, res) => {
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

  if (req.user!.role === 'institution_user' && req.user!.institution_id) {
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

  const tickets = db.prepare(sql).all(...params);
  return res.json(tickets);
});

// GET /api/disputes/:id - get ticket with messages thread
router.get('/:id', authenticate, (req: AuthRequest, res) => {
  const ticket = db.prepare(`
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

  // Restrict institution users to their own institution
  if (req.user!.role === 'institution_user' && req.user!.institution_id !== ticket.institution_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const messages = db.prepare(`
    SELECT * FROM dispute_messages
    WHERE ticket_id = ?
    ORDER BY created_at ASC
  `).all(req.params.id);

  return res.json({ ticket, messages });
});

// POST /api/disputes - open a dispute ticket
router.post('/', authenticate, requireRole(['admin', 'bureau_officer']), (req: AuthRequest, res) => {
  const { fdr_id, title, discrepancy_details, priority = 'High' } = req.body;

  if (!fdr_id || !title || !discrepancy_details) {
    return res.status(400).json({ error: 'FDR ID, title, and discrepancy details are required' });
  }

  const fdr = db.prepare('SELECT * FROM fdrs WHERE id = ?').get(fdr_id) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  const result = db.prepare(`
    INSERT INTO dispute_tickets (fdr_id, institution_id, title, discrepancy_details, status, priority, created_by)
    VALUES (?, ?, ?, ?, 'Open', ?, ?)
  `).run(fdr.id, fdr.institution_id, title, discrepancy_details, priority, req.user!.userId);

  const ticketId = result.lastInsertRowid;

  // Insert initial message
  db.prepare(`
    INSERT INTO dispute_messages (ticket_id, sender_id, sender_role, sender_name, message)
    VALUES (?, ?, ?, ?, ?)
  `).run(ticketId, req.user!.userId, req.user!.role, 'Council Regulation Officer', discrepancy_details);

  // Update FDR status to Discrepancy
  db.prepare(`
    UPDATE fdrs SET verification_status = 'Discrepancy', verification_notes = ? WHERE id = ?
  `).run(title, fdr.id);

  // Add alert
  db.prepare(`
    INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message)
    VALUES (?, ?, 'Discrepancy', 'Critical', ?)
  `).run(fdr.id, fdr.institution_id, `Dispute Opened: ${title}`);

  return res.status(201).json({ id: ticketId, message: 'Dispute ticket opened successfully' });
});

// POST /api/disputes/:id/messages - add clarification message
router.post('/:id/messages', authenticate, (req: AuthRequest, res) => {
  const { message, attachment_url } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  const ticket = db.prepare('SELECT * FROM dispute_tickets WHERE id = ?').get(req.params.id) as any;
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const senderName = req.user!.role === 'institution_user' ? 'Institution Accounts Officer' : 'Council Regulation Officer';

  db.prepare(`
    INSERT INTO dispute_messages (ticket_id, sender_id, sender_role, sender_name, message, attachment_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ticket.id, req.user!.userId, req.user!.role, senderName, message, attachment_url || null);

  // If institution responded, mark ticket as 'Clarification Submitted'
  if (req.user!.role === 'institution_user' && ticket.status === 'Open') {
    db.prepare('UPDATE dispute_tickets SET status = "Clarification Submitted" WHERE id = ?').run(ticket.id);
  }

  return res.status(201).json({ success: true });
});

// PATCH /api/disputes/:id/resolve - resolve dispute
router.patch('/:id/resolve', authenticate, requireRole(['admin', 'bureau_officer']), (req: AuthRequest, res) => {
  const ticket = db.prepare('SELECT * FROM dispute_tickets WHERE id = ?').get(req.params.id) as any;
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  db.prepare(`
    UPDATE dispute_tickets 
    SET status = 'Resolved', resolved_at = datetime('now'), resolved_by = ?
    WHERE id = ?
  `).run(req.user!.userId, ticket.id);

  // Update FDR verification status back to Verified
  db.prepare(`
    UPDATE fdrs SET verification_status = 'Verified', verification_notes = 'Dispute resolved and verified by Council'
    WHERE id = ?
  `).run(ticket.fdr_id);

  // Resolve active discrepancy alert for this FDR
  db.prepare(`
    UPDATE alerts SET is_resolved = 1, resolved_at = datetime('now'), resolved_by = ?
    WHERE fdr_id = ? AND alert_type = 'Discrepancy'
  `).run(req.user!.userId, ticket.fdr_id);

  return res.json({ success: true, message: 'Dispute marked as Resolved and FDR verification restored.' });
});

export default router;
