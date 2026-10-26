import express from 'express';
import { db, executeMutation } from '../db/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/invocations - List all lien invocations with strict institution isolation
router.get('/', authenticate, (req: AuthRequest, res) => {
  const { status, institution_id } = req.query;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  // Strict Fail-Closed Isolation
  if (req.user!.role === 'institution_user') {
    if (!req.user!.institution_id) {
      return res.status(403).json({ error: 'Access denied: User is not linked to any registered institution.' });
    }
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
    return res.status(403).json({ error: 'Access denied: You do not possess clearance for this invocation record.' });
  }

  return res.json(inv);
});

// POST /api/invocations - Initiate a new lien invocation with cloud persistence
router.post('/', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
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
    const result = await executeMutation(`
      INSERT INTO lien_invocations (
        fdr_id, institution_id, invocation_ref, reason_code, justification,
        demand_amount, status, initiated_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'Initiated', ?)
    `, [fdr.id, fdr.institution_id, invocationRef, reason_code, justification, amount, req.user!.userId]);

    // Update FDR status
    await executeMutation("UPDATE fdrs SET status = 'Under Invocation', last_updated_by = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.user!.userId, fdr.id]);

    // Create Critical Alert
    await executeMutation(`
      INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message)
      VALUES (?, ?, 'Discrepancy', 'Critical', ?)
    `, [fdr.id, fdr.institution_id, `STATUTORY LIEN INVOCATION initiated for FDR ${fdr.fdr_number} (Ref: ${invocationRef}). Reason: ${reason_code}`]);

    // Audit log
    await executeMutation(`
      INSERT INTO audit_log (entity_type, entity_id, action, changed_by, new_value, notes)
      VALUES ('Lien_Invocation', ?, 'Initiated', ?, ?, ?)
    `, [result.lastInsertRowid, req.user!.userId, JSON.stringify({ invocation_ref: invocationRef, fdr_number: fdr.fdr_number, demand_amount: amount }), `Lien Invocation ${invocationRef} opened`]);

    return res.status(201).json(db.prepare('SELECT * FROM lien_invocations WHERE id = ?').get(result.lastInsertRowid));
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to initiate lien invocation', details: err.message });
  }
});

// POST /api/invocations/:id/show-cause - Issue formal Statutory Show-Cause Notice
router.post('/:id/show-cause', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const inv = db.prepare('SELECT * FROM lien_invocations WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Invocation record not found' });

  const showCauseRef = `SCN/AICTE/REG/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;
  const cureDays = req.body.cure_period_days || 15;
  const deadlineDate = new Date(Date.now() + cureDays * 86400000);
  const deadline = deadlineDate.toISOString().split('T')[0];

  try {
    await executeMutation(`
      UPDATE lien_invocations
      SET status = 'ShowCause_Issued',
          show_cause_ref = ?,
          show_cause_date = CURRENT_TIMESTAMP,
          show_cause_deadline = ?,
          remarks = COALESCE(?, remarks)
      WHERE id = ?
    `, [showCauseRef, deadline, req.body.remarks || `Show cause notice issued with ${cureDays}-day cure window`, req.params.id]);

    await executeMutation(`
      INSERT INTO audit_log (entity_type, entity_id, action, changed_by, new_value, notes)
      VALUES ('Lien_Invocation', ?, 'Show-Cause Notice Issued', ?, ?, ?)
    `, [req.params.id, req.user!.userId, JSON.stringify({ show_cause_ref: showCauseRef, deadline }), `Show-Cause Notice ${showCauseRef} served`]);

    return res.json({
      success: true,
      show_cause_ref: showCauseRef,
      deadline,
      message: `Statutory Show-Cause Notice served with mandatory cure deadline of ${deadline}.`
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to issue show cause notice', details: err.message });
  }
});

// POST /api/invocations/:id/serve-demand - Issue Bank Demand Notice under AICTE Act
router.post('/:id/serve-demand', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const inv = db.prepare('SELECT * FROM lien_invocations WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Invocation record not found' });

  const bankDemandRef = `DEMAND/AICTE/LEGAL/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    await executeMutation(`
      UPDATE lien_invocations
      SET status = 'BankDemand_Issued',
          bank_demand_ref = ?,
          bank_demand_served_at = CURRENT_TIMESTAMP,
          remarks = COALESCE(?, remarks)
      WHERE id = ?
    `, [bankDemandRef, req.body.remarks || 'Bank Demand Notice for encashment served on Branch Manager.', req.params.id]);

    await executeMutation(`
      INSERT INTO audit_log (entity_type, entity_id, action, changed_by, new_value, notes)
      VALUES ('Lien_Invocation', ?, 'Bank Demand Served', ?, ?, ?)
    `, [req.params.id, req.user!.userId, JSON.stringify({ bank_demand_ref: bankDemandRef }), `Bank Demand Order ${bankDemandRef} served`]);

    return res.json({
      success: true,
      bank_demand_ref: bankDemandRef,
      message: 'Official Bank Encashment Order served under Section 10 of AICTE Act, 1987.'
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to serve bank demand', details: err.message });
  }
});

// PATCH /api/invocations/:id/confirm-recovery - Confirm funds remittance
router.patch('/:id/confirm-recovery', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const { recovery_utr_challan, recovery_date, dsc_sign_hash, remarks } = req.body;
  const inv = db.prepare('SELECT * FROM lien_invocations WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Invocation record not found' });

  if (!recovery_utr_challan) {
    return res.status(400).json({ error: 'Bank remittance UTR / Challan reference is required' });
  }

  try {
    await executeMutation(`
      UPDATE lien_invocations
      SET status = 'Funds_Encashment_Confirmed',
          recovery_utr_challan = ?,
          recovery_date = ?,
          approved_by = ?,
          approved_at = CURRENT_TIMESTAMP,
          dsc_sign_hash = ?,
          remarks = COALESCE(?, remarks)
      WHERE id = ?
    `, [
      recovery_utr_challan,
      recovery_date || new Date().toISOString().split('T')[0],
      req.user!.userId,
      dsc_sign_hash || '0x' + Buffer.from(recovery_utr_challan).toString('hex').padEnd(64, '0'),
      remarks || 'Forfeiture confirmed and credited to AICTE Regulatory Account.',
      req.params.id
    ]);

    await executeMutation(`
      UPDATE fdrs
      SET status = 'Forfeited',
          last_updated_by = ?,
          last_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [req.user!.userId, inv.fdr_id]);

    await executeMutation(`
      INSERT INTO audit_log (entity_type, entity_id, action, changed_by, new_value, notes)
      VALUES ('Lien_Invocation', ?, 'Forfeiture Confirmed', ?, ?, ?)
    `, [req.params.id, req.user!.userId, JSON.stringify({ utr: recovery_utr_challan, amount: inv.demand_amount }), `Forfeiture confirmed via UTR ${recovery_utr_challan}`]);

    return res.json({
      success: true,
      message: `Security deposit of ₹${inv.demand_amount.toLocaleString('en-IN')} successfully encashed and credited to Council Consolidated Fund.`
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to confirm remittance recovery', details: err.message });
  }
});

// PATCH /api/invocations/:id/drop - Drop invocation upon compliance
router.patch('/:id/drop', authenticate, requireRole(['admin']), async (req: AuthRequest, res) => {
  const inv = db.prepare('SELECT * FROM lien_invocations WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Invocation record not found' });

  try {
    await executeMutation(`
      UPDATE lien_invocations
      SET status = 'Dropped',
          approved_by = ?,
          approved_at = CURRENT_TIMESTAMP,
          remarks = ?
      WHERE id = ?
    `, [req.user!.userId, req.body.remarks || 'Invocation dropped upon satisfactory compliance verification.', req.params.id]);

    await executeMutation("UPDATE fdrs SET status = 'Active', last_updated_by = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.user!.userId, inv.fdr_id]);

    await executeMutation(`
      INSERT INTO audit_log (entity_type, entity_id, action, changed_by, new_value, notes)
      VALUES ('Lien_Invocation', ?, 'Dropped', ?, ?, ?)
    `, [req.params.id, req.user!.userId, JSON.stringify({ reason: req.body.remarks }), `Dropped: ${req.body.remarks}`]);

    return res.json({ success: true, message: 'Lien Invocation dropped. FDR restored to Active status.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to drop invocation', details: err.message });
  }
});

export default router;
