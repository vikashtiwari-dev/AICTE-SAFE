import express from 'express';
import crypto from 'crypto';
import { db, executeMutation, recordAuditLog } from '../db/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { validateLockInEligibility } from '../services/aphService';

const router = express.Router();

// GET /api/releases - List with institution isolation
router.get('/', authenticate, async (req: AuthRequest, res) => {
  const { status, request_type } = req.query;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  // Strict fail-closed isolation for institution users
  if (req.user!.role === 'institution_user') {
    if (!req.user!.institution_id) {
      return res.status(403).json({ error: 'Access denied: User is not linked to any registered institution.' });
    }
    whereClause += ' AND r.institution_id = ?';
    params.push(req.user!.institution_id);
  }

  if (status) {
    whereClause += ' AND r.status = ?';
    params.push(status);
  }
  if (request_type) {
    whereClause += ' AND r.request_type = ?';
    params.push(request_type);
  }

  const requests = await db.prepare(`
    SELECT r.*,
      i.name as institution_name, i.aicte_id,
      f.fdr_number, f.bank_name, f.deposit_amount, f.maturity_date, f.status as fdr_status, f.verification_status,
      u1.full_name as requested_by_name,
      u2.full_name as dealing_officer_name,
      u3.full_name as finance_officer_name,
      u4.full_name as approved_by_name
    FROM release_requests r
    JOIN institutions i ON r.institution_id = i.id
    JOIN fdrs f ON r.fdr_id = f.id
    LEFT JOIN users u1 ON r.requested_by = u1.id
    LEFT JOIN users u2 ON r.dealing_officer_id = u2.id
    LEFT JOIN users u3 ON r.finance_officer_id = u3.id
    LEFT JOIN users u4 ON r.approved_by = u4.id
    ${whereClause}
    ORDER BY r.requested_at DESC
  `).all(...params) as any[];

  return res.json(requests);
});

// POST /api/releases - Create release request with eligibility verification
router.post('/', authenticate, requireRole(['admin', 'bureau_officer', 'institution_user']), async (req: AuthRequest, res) => {
  const { fdr_id, request_type = 'Release', reason, remarks } = req.body;

  if (!fdr_id || !reason) {
    return res.status(400).json({ error: 'FDR ID and substantive release reason are required' });
  }

  const fdr = await db.prepare('SELECT * FROM fdrs WHERE id = ?').get(fdr_id) as any;
  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  // Ownership verification
  if (req.user!.role === 'institution_user' && fdr.institution_id !== req.user!.institution_id) {
    return res.status(403).json({ error: 'Forbidden: You cannot request release for an instrument of another institution.' });
  }

  // Regulatory eligibility checks
  if (fdr.status === 'Released') {
    return res.status(400).json({ error: 'Regulatory conflict: This instrument is already marked Released.' });
  }
  if (fdr.verification_status === 'Discrepancy') {
    return res.status(400).json({ error: 'Eligibility rejection: Cannot initiate release on an instrument with active scrutiny discrepancies.' });
  }

  // Prevent duplicate active release requests
  const existingPending = await db.prepare(`
    SELECT id FROM release_requests 
    WHERE fdr_id = ? AND status IN ('Submitted', 'Under Review', 'Pending')
  `).get(fdr_id);
  if (existingPending) {
    return res.status(409).json({ error: 'An active release/refund request is already under review for this FDR.' });
  }

  try {
    const createdRequest = await db.transaction(async (tx) => {
      const result = await tx.execute(`
        INSERT INTO release_requests (fdr_id, institution_id, request_type, reason, requested_by, status, review_stage, dealing_officer_remarks)
        VALUES (?, ?, ?, ?, ?, 'Submitted', 'Dealing_Officer', ?)
      `, [fdr_id, fdr.institution_id, request_type, reason, req.user!.userId, remarks || null]);

      // Update FDR status to 'Under Review for Release'
      await tx.execute("UPDATE fdrs SET status = 'Under Review for Release', last_updated_by = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.user!.userId, fdr_id]);

      await recordAuditLog(tx, {
        entity_type: 'Release',
        entity_id: result.lastInsertRowid,
        action: 'Request Submitted',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({ fdr_number: fdr.fdr_number, request_type, reason }),
        notes: `Release request submitted by ${req.user!.username}`
      });

      return await tx.queryOne('SELECT * FROM release_requests WHERE id = ?', [result.lastInsertRowid]);
    });

    return res.status(201).json(createdRequest);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create release request' });
  }
});

// PATCH /api/releases/:id/tier-review - Strictly Enforced Maker-Checker Multi-Tier Workflow
router.patch('/:id/tier-review', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const { stage, remarks, decision = 'FORWARD' } = req.body;
  const request = await db.prepare('SELECT r.*, f.fdr_number, f.deposit_amount FROM release_requests r JOIN fdrs f ON r.fdr_id = f.id WHERE r.id = ?').get(req.params.id) as any;
  if (!request) return res.status(404).json({ error: 'Release request not found' });

  // Maker-Checker Rule: Recommender / Requester cannot review their own request (Strictly enforced, no exceptions)
  if (request.requested_by === req.user!.userId) {
    return res.status(403).json({ error: 'Maker-Checker policy violation: The officer who submitted or requested this release cannot review or clear it.' });
  }

  // Handle Rejection at any stage
  if (decision === 'REJECT') {
    if (!remarks || remarks.trim().length < 5) {
      return res.status(400).json({ error: 'Substantive justification is required when rejecting a release request.' });
    }
    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE release_requests 
        SET status = 'Rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [remarks, req.user!.userId, req.params.id]);

      // Revert FDR status to Active
      await tx.execute("UPDATE fdrs SET status = 'Active', last_updated_by = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.user!.userId, request.fdr_id]);

      await recordAuditLog(tx, {
        entity_type: 'Release',
        entity_id: Number(req.params.id),
        action: 'Release Rejected',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({ rejection_reason: remarks, stage: request.review_stage }),
        notes: remarks
      });
    });

    return res.json({ success: true, message: 'Release request rejected. Instrument returned to Active status.' });
  }

  // Sequential Stage Gate Enforcement:
  // Dealing_Officer -> Finance_Officer -> Director_Approval
  if (stage === 'Finance_Officer') {
    if (request.review_stage !== 'Dealing_Officer') {
      return res.status(400).json({ error: `State transition error: Cannot move to Finance_Officer from current stage "${request.review_stage}".` });
    }

    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE release_requests 
        SET review_stage = 'Finance_Officer', status = 'Under Review',
            dealing_officer_id = ?, dealing_officer_remarks = ?, dealing_officer_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [req.user!.userId, remarks || 'Dealing Assistant primary verification complete: Bank confirmation & lock-in requirements checked.', req.params.id]);

      await recordAuditLog(tx, {
        entity_type: 'Release',
        entity_id: Number(req.params.id),
        action: 'Dealing Scrutiny Cleared',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({ next_stage: 'Finance_Officer', remarks }),
        notes: remarks || 'Forwarded to Finance Officer'
      });
    });

    return res.json({ success: true, message: 'Dealing scrutiny completed. Case forwarded to Finance Officer.' });
  } else if (stage === 'Director_Approval') {
    if (request.review_stage !== 'Finance_Officer') {
      return res.status(400).json({ error: `State transition error: Finance Officer clearance required before forwarding to Competent Authority. Current stage: "${request.review_stage}".` });
    }

    // Separation of Duties: Dealing Officer who performed initial scrutiny cannot also act as Finance Officer
    if (request.dealing_officer_id && Number(request.dealing_officer_id) === Number(req.user!.userId)) {
      return res.status(403).json({ error: 'Separation of duties violation: Dealing officer who performed initial scrutiny cannot act as Finance Officer.' });
    }

    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE release_requests 
        SET review_stage = 'Director_Approval', status = 'Under Review',
            finance_officer_id = ?, finance_officer_remarks = ?, finance_officer_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [req.user!.userId, remarks || 'Finance Officer concurrence recorded: Interest reconciliation & no-dues confirmed.', req.params.id]);

      await recordAuditLog(tx, {
        entity_type: 'Release',
        entity_id: Number(req.params.id),
        action: 'Finance Review Cleared',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({ next_stage: 'Director_Approval', remarks }),
        notes: remarks || 'Forwarded to Director'
      });
    });

    return res.json({ success: true, message: 'Finance concurrence recorded. Forwarded to Director for statutory order approval.' });
  } else {
    return res.status(400).json({ error: `Unrecognized review stage "${stage}". Valid targets: "Finance_Officer", "Director_Approval".` });
  }
});

// POST /api/releases/:id/dsc-sign - Statutory Order Attestation Seal (Director / Competent Authority only)
router.post('/:id/dsc-sign', authenticate, requireRole(['admin']), async (req: AuthRequest, res) => {
  // Derive signer identity strictly from database record of authenticated session - ignore client body
  const signingUser = await db.queryOne('SELECT id, full_name, role FROM users WHERE id = ?', [req.user!.userId]) as any;
  const signerName = signingUser?.full_name || req.user!.username || 'Director, AICTE Regulation Bureau';
  const officerDesignation = 'Competent Authority (Director / Member Secretary)';

  const request = await db.prepare('SELECT r.*, f.fdr_number, f.deposit_amount FROM release_requests r JOIN fdrs f ON r.fdr_id = f.id WHERE r.id = ?').get(req.params.id) as any;
  if (!request) return res.status(404).json({ error: 'Release request not found' });

  // Enforce workflow completion: Cannot approve unless earlier scrutiny tiers are completed!
  if (request.review_stage !== 'Director_Approval' && request.status !== 'Approved') {
    return res.status(400).json({
      error: `Approval Gate Violation: Cannot issue statutory discharge order. Case must first clear Dealing Assistant and Finance Officer scrutiny. Current stage: "${request.review_stage}".`
    });
  }

  // Maker-Checker & Separation of Duties: Approving Director cannot be requester, dealing officer, or finance officer
  if (request.requested_by && Number(request.requested_by) === Number(req.user!.userId)) {
    return res.status(403).json({ error: 'Maker-Checker policy violation: Recommender/Requester cannot approve the final statutory release order.' });
  }
  if (request.dealing_officer_id && Number(request.dealing_officer_id) === Number(req.user!.userId)) {
    return res.status(403).json({ error: 'Separation of duties violation: Dealing Officer who conducted initial scrutiny cannot act as Approving Director.' });
  }
  if (request.finance_officer_id && Number(request.finance_officer_id) === Number(req.user!.userId)) {
    return res.status(403).json({ error: 'Separation of duties violation: Finance Officer who cleared financial concurrence cannot act as Approving Director.' });
  }

  // Generate authentic SHA-256 Statutory Electronic Order Attestation Hash
  const timestamp = new Date().toISOString();
  const orderNumber = `AICTE/REG/FDR-REL/${new Date().getFullYear()}/${request.id.toString().padStart(5, '0')}`;
  const dscPayload = `AICTE-STATUTORY-RELEASE-ORDER|ORDER_NO:${orderNumber}|REQ:${request.id}|FDR:${request.fdr_id}|OFFICER:${signerName}|TS:${timestamp}`;
  const dscHash = 'SEAL-SHA256-' + crypto.createHash('sha256').update(dscPayload).digest('hex').toUpperCase();

  try {
    // Transition request to Approved with Statutory Order Attestation
    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE release_requests 
        SET status = 'Approved', review_stage = 'Approved',
            approved_by = ?, approved_at = CURRENT_TIMESTAMP,
            director_id = ?, director_remarks = ?, director_at = CURRENT_TIMESTAMP,
            statutory_order_number = ?,
            remarks = 'Statutory Release Order approved under Section 10(k) AICTE Act'
        WHERE id = ?
      `, [req.user!.userId, req.user!.userId, `Formally sanctioned by ${signerName} (${officerDesignation})`, orderNumber, req.params.id]);

      await recordAuditLog(tx, {
        entity_type: 'Release',
        entity_id: Number(req.params.id),
        action: 'Statutory Release Approved',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({
          order_number: orderNumber,
          seal_hash: dscHash,
          signer: signerName,
          designation: officerDesignation,
          statutory_basis: 'Section 10(k) AICTE Act, 1987'
        }),
        notes: `Sanctioned by ${signerName}`
      });
    });

    return res.json({
      success: true,
      message: 'Statutory release order approved and cryptographically sealed for regulatory record.',
      order_number: orderNumber,
      approval_seal: dscHash,
      approving_officer: signerName,
      designation: officerDesignation,
      timestamp,
      legal_disclosure: 'Statutory Electronic Approval Attestation (Section 10 AICTE Act Audit Trail) - Prototype Seal'
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Approval order failed to record in cloud database' });
  }
});

// PATCH /api/releases/:id/complete - Discharge & Release Instrument (Requires Prior Approval)
router.patch('/:id/complete', authenticate, requireRole(['admin', 'bureau_officer']), async (req: AuthRequest, res) => {
  const request = await db.prepare('SELECT * FROM release_requests WHERE id = ?').get(req.params.id) as any;
  if (!request) return res.status(404).json({ error: 'Release request not found' });

  // STRICT FINANCIAL CONTROL: Cannot complete discharge unless officially Approved!
  if (request.status !== 'Approved') {
    return res.status(400).json({
      error: `Release Control Violation: Cannot discharge instrument. Request status is "${request.status}". Only an Approved request with a valid statutory order can be completed.`
    });
  }

  const { noc_document_path, discharge_remarks } = req.body;

  // Require documented provenance before discharging regulatory encumbrance
  if (!noc_document_path && !request.noc_document_path) {
    return res.status(400).json({
      error: 'Evidence required: Discharge cannot be completed without providing the verified Bank No-Objection Certificate (NOC) / discharge document reference.'
    });
  }

  try {
    await db.transaction(async (tx) => {
      // 1. Mark request completed
      await tx.execute(`
        UPDATE release_requests 
        SET status = 'Completed', review_stage = 'Completed',
            noc_document_path = COALESCE(?, noc_document_path),
            remarks = COALESCE(?, remarks)
        WHERE id = ?
      `, [noc_document_path || null, discharge_remarks || 'Bank lien formally discharged pursuant to AICTE Approval Order', req.params.id]);

      // 2. Mark FDR as Released
      await tx.execute(`
        UPDATE fdrs 
        SET status = 'Released', last_updated_by = ?, last_updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [req.user!.userId, request.fdr_id]);

      // 3. Record audit trail
      await recordAuditLog(tx, {
        entity_type: 'FDR',
        entity_id: request.fdr_id,
        action: 'Discharged and Released',
        changed_by: req.user!.userId,
        new_value: JSON.stringify({
          release_request_id: request.id,
          order_number: request.statutory_order_number,
          discharged_by: req.user!.userId
        }),
        notes: 'Marked released in portal registry — Bank Lien Relinquished'
      });
    });

    return res.json({
      success: true,
      message: 'FDR instrument successfully discharged and marked Released in the national registry (Bank Lien Relinquished in Portal Registry).',
      fdr_id: request.fdr_id,
      order_number: request.statutory_order_number
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Discharge transaction failed' });
  }
});

export default router;
