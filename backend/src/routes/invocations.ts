import express from 'express';
import { db, executeMutation, recordAuditLog } from '../db/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/invocations - List all lien invocations with strict institution isolation
router.get('/', authenticate, async (req: AuthRequest, res) => {
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

  const invocations = await db.prepare(`
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
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  const inv = await db.prepare(`
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

  const fdr = await db.prepare('SELECT * FROM fdrs WHERE id = ?').get(fdr_id) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  const randomRefNum = Math.floor(1000 + Math.random() * 9000);
  const invocationRef = `AICTE/REG/INV/${new Date().getFullYear()}/${randomRefNum}`;
  const amount = demand_amount || fdr.deposit_amount;

  try {
    const createdInv = await db.transaction(async (tx) => {
      const result = await tx.execute(`
        INSERT INTO lien_invocations (
          fdr_id, institution_id, case_reference_number, invocation_amount, justification,
          stage, initiated_by
        ) VALUES (?, ?, ?, ?, ?, 'INITIATED', ?)
      `, [fdr.id, fdr.institution_id, invocationRef, amount, justification, req.user!.userId]);

      // Update FDR status
      await tx.execute("UPDATE fdrs SET status = 'Under Invocation', last_updated_by = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.user!.userId, fdr.id]);

      // Create Critical Alert
      await tx.execute(`
        INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message)
        VALUES (?, ?, 'Discrepancy', 'Critical', ?)
      `, [fdr.id, fdr.institution_id, `STATUTORY LIEN INVOCATION initiated for FDR ${fdr.fdr_number} (Ref: ${invocationRef}). Reason: ${reason_code}`]);

      // Audit log
      await recordAuditLog(tx, {
        entity_type: 'Lien_Invocation',
        entity_id: result.lastInsertRowid,
        action: 'Initiated',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({ invocation_ref: invocationRef, fdr_number: fdr.fdr_number, demand_amount: amount }),
        notes: `Lien Invocation ${invocationRef} opened`
      });

      return await tx.queryOne('SELECT * FROM lien_invocations WHERE id = ?', [result.lastInsertRowid]);
    });

    return res.status(201).json(createdInv);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to initiate lien invocation', details: err.message });
  }
});

// POST /api/invocations/:id/show-cause - Issue formal Statutory Show-Cause Notice
router.post('/:id/show-cause', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const inv = await db.prepare('SELECT * FROM lien_invocations WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Invocation record not found' });

  const showCauseRef = `SCN/AICTE/REG/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;
  const cureDays = req.body.cure_period_days || 15;
  const deadlineDate = new Date(Date.now() + cureDays * 86400000);
  const deadline = deadlineDate.toISOString().split('T')[0];

  try {
    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE lien_invocations
        SET stage = 'SHOW_CAUSE_ISSUED',
            show_cause_notice_ref = ?,
            show_cause_date = CURRENT_TIMESTAMP,
            show_cause_due_date = ?,
            remarks = COALESCE(?, remarks)
        WHERE id = ?
      `, [showCauseRef, deadline, req.body.remarks || `Show cause notice issued with ${cureDays}-day cure window`, req.params.id]);

      await recordAuditLog(tx, {
        entity_type: 'Lien_Invocation',
        entity_id: Number(req.params.id),
        action: 'Show-Cause Notice Issued',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({ show_cause_ref: showCauseRef, deadline }),
        notes: `Show-Cause Notice ${showCauseRef} served`
      });
    });

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
  const inv = await db.prepare('SELECT * FROM lien_invocations WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Invocation record not found' });

  const bankDemandRef = `DEMAND/AICTE/LEGAL/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE lien_invocations
        SET stage = 'BANK_DEMAND_SERVED',
            bank_demand_letter_ref = ?,
            bank_demand_sent_at = CURRENT_TIMESTAMP,
            remarks = COALESCE(?, remarks)
        WHERE id = ?
      `, [bankDemandRef, req.body.remarks || 'Bank Demand Notice for encashment served on Branch Manager.', req.params.id]);

      await recordAuditLog(tx, {
        entity_type: 'Lien_Invocation',
        entity_id: Number(req.params.id),
        action: 'Bank Demand Served',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({ bank_demand_ref: bankDemandRef }),
        notes: `Bank Demand Order ${bankDemandRef} served`
      });
    });

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
  const { recovery_utr_challan, recovery_date, remarks } = req.body;
  const inv = await db.prepare('SELECT * FROM lien_invocations WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Invocation record not found' });

  if (!recovery_utr_challan) {
    return res.status(400).json({ error: 'Bank remittance UTR / Challan reference is required' });
  }

  try {
    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE lien_invocations
        SET stage = 'RECOVERED',
            utr_number = ?,
            remitted_at = CURRENT_TIMESTAMP,
            remarks = COALESCE(?, remarks)
        WHERE id = ?
      `, [
        recovery_utr_challan,
        remarks || 'Forfeiture confirmed and credited to AICTE Regulatory Account.',
        req.params.id
      ]);

      await tx.execute(`
        UPDATE fdrs
        SET status = 'Invoked / Forfeited',
            last_updated_by = ?,
            last_updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [req.user!.userId, inv.fdr_id]);

      await recordAuditLog(tx, {
        entity_type: 'Lien_Invocation',
        entity_id: Number(req.params.id),
        action: 'Forfeiture Confirmed',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({ utr: recovery_utr_challan, amount: inv.invocation_amount }),
        notes: `Forfeiture confirmed via UTR ${recovery_utr_challan}`
      });
    });

    return res.json({
      success: true,
      message: `Security deposit of ₹${Number(inv.invocation_amount || 0).toLocaleString('en-IN')} successfully encashed and credited to Council Consolidated Fund.`
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to confirm remittance recovery', details: err.message });
  }
});

// PATCH /api/invocations/:id/drop - Drop invocation upon compliance
router.patch('/:id/drop', authenticate, requireRole(['admin']), async (req: AuthRequest, res) => {
  const inv = await db.prepare('SELECT * FROM lien_invocations WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Invocation record not found' });

  try {
    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE lien_invocations
        SET stage = 'DROPPED',
            remarks = ?
        WHERE id = ?
      `, [req.body.remarks || 'Invocation dropped upon satisfactory compliance verification.', req.params.id]);

      await tx.execute("UPDATE fdrs SET status = 'Active', last_updated_by = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.user!.userId, inv.fdr_id]);

      await recordAuditLog(tx, {
        entity_type: 'Lien_Invocation',
        entity_id: Number(req.params.id),
        action: 'Dropped',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({ reason: req.body.remarks }),
        notes: `Dropped: ${req.body.remarks}`
      });
    });

    return res.json({ success: true, message: 'Lien Invocation dropped. FDR restored to Active status.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to drop invocation', details: err.message });
  }
});

export default router;
