import express from 'express';
import { db } from '../db/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/invocations - List all lien invocations
router.get('/', authenticate, (req: AuthRequest, res) => {
  const { status, institution_id } = req.query;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (req.user!.role === 'institution_user' && req.user!.institution_id) {
    whereClause += ' AND li.institution_id = ?';
    params.push(req.user!.institution_id);
  } else if (institution_id) {
    whereClause += ' AND li.institution_id = ?';
    params.push(institution_id);
  }

  if (status) {
    whereClause += ' AND li.status = ?';
    params.push(status);
  }

  const invocations = db.prepare(`
    SELECT li.*,
      i.name as institution_name, i.aicte_id, i.contact_email, i.contact_phone,
      f.fdr_number, f.bank_name, f.bank_branch, f.deposit_amount, f.maturity_date, f.status as fdr_status,
      u1.full_name as initiated_by_name,
      u2.full_name as approved_by_name
    FROM lien_invocations li
    JOIN institutions i ON li.institution_id = i.id
    JOIN fdrs f ON li.fdr_id = f.id
    LEFT JOIN users u1 ON li.initiated_by = u1.id
    LEFT JOIN users u2 ON li.approved_by = u2.id
    ${whereClause}
    ORDER BY li.initiated_at DESC
  `).all(...params);

  return res.json(invocations);
});

// GET /api/invocations/:id - Single invocation
router.get('/:id', authenticate, (req: AuthRequest, res) => {
  const inv = db.prepare(`
    SELECT li.*,
      i.name as institution_name, i.aicte_id, i.contact_email, i.contact_phone, i.address,
      f.fdr_number, f.bank_name, f.bank_branch, f.deposit_amount, f.maturity_date, f.status as fdr_status,
      u1.full_name as initiated_by_name,
      u2.full_name as approved_by_name
    FROM lien_invocations li
    JOIN institutions i ON li.institution_id = i.id
    JOIN fdrs f ON li.fdr_id = f.id
    LEFT JOIN users u1 ON li.initiated_by = u1.id
    LEFT JOIN users u2 ON li.approved_by = u2.id
    WHERE li.id = ?
  `).get(req.params.id) as any;

  if (!inv) return res.status(404).json({ error: 'Lien Invocation record not found' });

  if (req.user!.role === 'institution_user' && inv.institution_id !== req.user!.institution_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  return res.json(inv);
});

// POST /api/invocations - Initiate a new lien invocation
router.post('/', authenticate, requireRole(['admin', 'bureau_officer']), (req: AuthRequest, res) => {
  const { fdr_id, reason_code, justification, demand_amount } = req.body;

  if (!fdr_id || !reason_code || !justification) {
    return res.status(400).json({ error: 'FDR ID, reason code, and justification are mandatory' });
  }

  const fdr = db.prepare('SELECT * FROM fdrs WHERE id = ?').get(fdr_id) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  const randomRefNum = Math.floor(1000 + Math.random() * 9000);
  const invocationRef = `AICTE/REG/INV/${new Date().getFullYear()}/${randomRefNum}`;
  const amount = demand_amount || fdr.deposit_amount;

  try {
    const result = db.prepare(`
      INSERT INTO lien_invocations (
        fdr_id, institution_id, invocation_ref, reason_code, justification,
        demand_amount, status, initiated_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'Initiated', ?)
    `).run(fdr.id, fdr.institution_id, invocationRef, reason_code, justification, amount, req.user!.userId);

    // Update FDR status
    db.prepare("UPDATE fdrs SET status = 'Under Invocation', last_updated_by = ?, last_updated_at = datetime('now') WHERE id = ?")
      .run(req.user!.userId, fdr.id);

    // Create Critical Alert
    db.prepare(`
      INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message)
      VALUES (?, ?, 'Discrepancy', 'Critical', ?)
    `).run(fdr.id, fdr.institution_id, `STATUTORY LIEN INVOCATION initiated for FDR ${fdr.fdr_number} (Ref: ${invocationRef}). Reason: ${reason_code}`);

    // Audit log
    db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
      VALUES ('Lien_Invocation', ?, 'Initiated', ?, ?)
    `).run(result.lastInsertRowid, req.user!.userId, `Statutory Lien Invocation ${invocationRef} opened against FDR ${fdr.fdr_number} for ₹${amount.toLocaleString('en-IN')}`);

    return res.status(201).json(db.prepare('SELECT * FROM lien_invocations WHERE id = ?').get(result.lastInsertRowid));
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to initiate lien invocation', details: err.message });
  }
});

// POST /api/invocations/:id/show-cause - Issue formal Statutory Show-Cause Notice
router.post('/:id/show-cause', authenticate, requireRole(['admin', 'bureau_officer']), (req: AuthRequest, res) => {
  const inv = db.prepare('SELECT * FROM lien_invocations WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Invocation record not found' });

  const showCauseRef = `SCN/AICTE/REG/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;
  const deadline = new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]; // 15-day statutory cure period

  db.prepare(`
    UPDATE lien_invocations
    SET status = 'ShowCause_Served',
        show_cause_ref = ?,
        show_cause_issued_at = datetime('now'),
        show_cause_deadline = ?,
        remarks = COALESCE(?, remarks)
    WHERE id = ?
  `).run(showCauseRef, deadline, req.body.remarks || 'Statutory 15-day Show Cause Notice issued.', req.params.id);

  db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
    VALUES ('Lien_Invocation', ?, 'Show-Cause Issued', ?, ?)
  `).run(req.params.id, req.user!.userId, `Show-Cause Notice ${showCauseRef} issued with compliance deadline ${deadline}`);

  return res.json({
    success: true,
    show_cause_ref: showCauseRef,
    deadline,
    message: `Statutory Show-Cause Notice served with mandatory cure deadline of ${deadline}.`
  });
});

// POST /api/invocations/:id/serve-demand - Issue Bank Demand Notice under AICTE Act
router.post('/:id/serve-demand', authenticate, requireRole(['admin', 'bureau_officer']), (req: AuthRequest, res) => {
  const inv = db.prepare('SELECT * FROM lien_invocations WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Invocation record not found' });

  const bankDemandRef = `DEMAND/AICTE/LEGAL/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;

  db.prepare(`
    UPDATE lien_invocations
    SET status = 'BankDemand_Issued',
        bank_demand_ref = ?,
        bank_demand_served_at = datetime('now'),
        remarks = COALESCE(?, remarks)
    WHERE id = ?
  `).run(bankDemandRef, req.body.remarks || 'Bank Demand Notice for encashment served on Branch Manager.', req.params.id);

  db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
    VALUES ('Lien_Invocation', ?, 'Bank Demand Served', ?, ?)
  `).run(req.params.id, req.user!.userId, `Official Encashment Demand ${bankDemandRef} served to issuing bank.`);

  return res.json({
    success: true,
    bank_demand_ref: bankDemandRef,
    message: 'Official Bank Encashment Order served under Section 10 of AICTE Act, 1987.'
  });
});

// PATCH /api/invocations/:id/confirm-recovery - Confirm funds remittance into AICTE Consolidated Account
router.patch('/:id/confirm-recovery', authenticate, requireRole(['admin', 'bureau_officer']), (req: AuthRequest, res) => {
  const { recovery_utr_challan, recovery_date, dsc_sign_hash, remarks } = req.body;
  const inv = db.prepare('SELECT * FROM lien_invocations WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Invocation record not found' });

  if (!recovery_utr_challan) {
    return res.status(400).json({ error: 'Bank remittance UTR / Challan reference is required' });
  }

  // Update invocation
  db.prepare(`
    UPDATE lien_invocations
    SET status = 'Funds_Encashment_Confirmed',
        recovery_utr_challan = ?,
        recovery_date = ?,
        approved_by = ?,
        approved_at = datetime('now'),
        dsc_sign_hash = ?,
        remarks = COALESCE(?, remarks)
    WHERE id = ?
  `).run(
    recovery_utr_challan,
    recovery_date || new Date().toISOString().split('T')[0],
    req.user!.userId,
    dsc_sign_hash || '0x' + Buffer.from(recovery_utr_challan).toString('hex').padEnd(64, '0'),
    remarks || 'Forfeiture confirmed and credited to AICTE Regulatory Account.',
    req.params.id
  );

  // Update FDR status to Forfeited
  db.prepare(`
    UPDATE fdrs
    SET status = 'Forfeited',
        is_encashed = 1,
        last_updated_by = ?,
        last_updated_at = datetime('now')
    WHERE id = ?
  `).run(req.user!.userId, inv.fdr_id);

  // Audit log
  db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
    VALUES ('Lien_Invocation', ?, 'Forfeiture Confirmed', ?, ?)
  `).run(req.params.id, req.user!.userId, `Deposit amount ₹${inv.demand_amount.toLocaleString('en-IN')} forfeited and credited via UTR ${recovery_utr_challan}.`);

  return res.json({
    success: true,
    message: `Security deposit of ₹${inv.demand_amount.toLocaleString('en-IN')} successfully encashed and credited to Council Consolidated Fund.`
  });
});

// PATCH /api/invocations/:id/drop - Drop invocation upon institutional compliance
router.patch('/:id/drop', authenticate, requireRole(['admin']), (req: AuthRequest, res) => {
  const inv = db.prepare('SELECT * FROM lien_invocations WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Invocation record not found' });

  db.prepare(`
    UPDATE lien_invocations
    SET status = 'Dropped',
        approved_by = ?,
        approved_at = datetime('now'),
        remarks = ?
    WHERE id = ?
  `).run(req.user!.userId, req.body.remarks || 'Invocation dropped upon satisfactory compliance verification.', req.params.id);

  // Restore FDR status to Active
  db.prepare(`
    UPDATE fdrs SET status = 'Active', last_updated_by = ?, last_updated_at = datetime('now') WHERE id = ?
  `).run(req.user!.userId, inv.fdr_id);

  db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, changed_by, notes)
    VALUES ('Lien_Invocation', ?, 'Dropped', ?, ?)
  `).run(req.params.id, req.user!.userId, `Invocation dropped by Council Administrator. Remarks: ${req.body.remarks}`);

  return res.json({ success: true, message: 'Lien Invocation dropped. FDR restored to Active status.' });
});

export default router;

