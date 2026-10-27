import express from 'express';
import { db, executeMutation } from '../db/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import fs from 'fs';

const router = express.Router();

// GET /api/bulk/template - Download sample CSV template
router.get('/template', (_req, res) => {
  const csvContent = [
    'aicte_id,institution_name,fdr_number,bank_name,bank_branch,account_number,deposit_amount,issue_date,maturity_date,interest_rate,deposit_type,purpose',
    'AICTE-2024-MH-001,"Maharashtra Institute of Technology, Pune",FDR-BULK-2026-001,"State Bank of India","Kothrud Branch",39821738190,5000000,2024-01-15,2032-01-15,7.15,FDR,"Mandatory APH Regulatory Security Deposit"',
    'AICTE-2024-DL-002,"Delhi School of Management",FDR-BULK-2026-002,"Punjab National Bank","Parliament Street Branch",11092837461,3000000,2023-06-10,2031-06-10,6.95,Bank Guarantee,"New Program Approval Deposit"',
    'AICTE-2024-KA-003,"Bangalore Pharmacy College",FDR-BULK-2026-003,"Canara Bank","Head Office Bangalore",56019283746,2000000,2024-03-20,2034-03-20,7.20,FDR,"Institutional Approval Renewal"'
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="AICTE_FDR_Bulk_Ingestion_Template.csv"');
  return res.send(csvContent);
});

// GET /api/bulk/history - List past batch ingestion jobs
router.get('/history', authenticate, requireRole(['admin', 'bureau_officer']), async (_req, res) => {
  const jobs = await db.prepare(`
    SELECT b.*, u.full_name as uploaded_by_name
    FROM bulk_ingestion_jobs b
    LEFT JOIN users u ON b.uploaded_by = u.id
    ORDER BY b.created_at DESC
    LIMIT 20
  `).all();
  return res.json(jobs);
});

// POST /api/bulk/upload - Process CSV batch ingestion with cloud persistence
router.post('/upload', authenticate, requireRole(['admin', 'bureau_officer']), upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a CSV file' });
  }

  let content = '';
  try {
    content = fs.readFileSync(req.file.path, 'utf-8');
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to read uploaded file', details: err.message });
  }

  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    return res.status(400).json({ error: 'CSV file is empty or missing data rows' });
  }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const expectedFields = ['aicte_id', 'fdr_number', 'bank_name', 'deposit_amount', 'issue_date', 'maturity_date'];
  for (const exp of expectedFields) {
    if (!headers.includes(exp)) {
      return res.status(400).json({ error: `CSV missing required header column: "${exp}"` });
    }
  }

  const aicteIdIdx = headers.indexOf('aicte_id');
  const instNameIdx = headers.indexOf('institution_name');
  const fdrNumIdx = headers.indexOf('fdr_number');
  const bankNameIdx = headers.indexOf('bank_name');
  const branchIdx = headers.indexOf('bank_branch');
  const accNumIdx = headers.indexOf('account_number');
  const amountIdx = headers.indexOf('deposit_amount');
  const issueDateIdx = headers.indexOf('issue_date');
  const maturityDateIdx = headers.indexOf('maturity_date');
  const rateIdx = headers.indexOf('interest_rate');
  const typeIdx = headers.indexOf('deposit_type');
  const purposeIdx = headers.indexOf('purpose');

  let successCount = 0;
  const errors: Array<{ row: number; fdr_number?: string; error: string }> = [];

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  }

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const parts = parseCSVLine(lines[i]);
    if (parts.length < expectedFields.length) continue;

    const aicteId = (parts[aicteIdIdx] || '').trim();
    const instName = instNameIdx !== -1 ? (parts[instNameIdx] || '').trim() : '';
    const fdrNumber = (parts[fdrNumIdx] || '').trim().toUpperCase();
    const bankName = (parts[bankNameIdx] || '').trim();
    const bankBranch = branchIdx !== -1 ? (parts[branchIdx] || '').trim() : '';
    const accNumber = accNumIdx !== -1 ? (parts[accNumIdx] || '').trim() : '';
    const rawAmount = (parts[amountIdx] || '').replace(/[^0-9.]/g, '');
    const depositAmount = parseFloat(rawAmount);
    const issueDate = (parts[issueDateIdx] || '').trim();
    const maturityDate = (parts[maturityDateIdx] || '').trim();
    const interestRate = rateIdx !== -1 && parts[rateIdx] ? parseFloat(parts[rateIdx]) : null;
    const depositType = typeIdx !== -1 && parts[typeIdx] ? parts[typeIdx] : 'FDR';
    const purpose = purposeIdx !== -1 ? parts[purposeIdx] : 'Bulk Ingested APH Deposit';

    if (!aicteId || !fdrNumber || !bankName || isNaN(depositAmount) || !issueDate || !maturityDate) {
      errors.push({ row: rowNum, fdr_number: fdrNumber, error: 'Missing mandatory values' });
      continue;
    }

    let institution = await db.prepare('SELECT id FROM institutions WHERE aicte_id = ?').get(aicteId) as any;
    if (!institution) {
      if (instName) {
        try {
          const createInst = await executeMutation(`
            INSERT INTO institutions (aicte_id, name, institution_type, contact_email)
            VALUES (?, ?, 'Technical', ?)
          `, [aicteId, instName, `registrar@${aicteId.toLowerCase().replace(/[^a-z0-9]/g, '')}.edu.in`]);
          institution = { id: createInst.lastInsertRowid };
        } catch (_) {
          errors.push({ row: rowNum, fdr_number: fdrNumber, error: `Could not register institution ${aicteId}` });
          continue;
        }
      } else {
        errors.push({ row: rowNum, fdr_number: fdrNumber, error: `Institution with AICTE ID "${aicteId}" not found in database.` });
        continue;
      }
    }

    const dup = await db.prepare('SELECT id FROM fdrs WHERE fdr_number = ?').get(fdrNumber);
    if (dup) {
      errors.push({ row: rowNum, fdr_number: fdrNumber, error: `FDR Number "${fdrNumber}" already exists in the portal records.` });
      continue;
    }

    try {
      await executeMutation(`
        INSERT INTO fdrs (
          institution_id, fdr_number, bank_name, bank_branch, account_number, deposit_amount,
          issue_date, maturity_date, interest_rate, deposit_type, purpose,
          submitted_by, last_updated_by, status, verification_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', 'Unverified')
      `, [
        institution.id, fdrNumber, bankName, bankBranch || null, accNumber || null,
        depositAmount, issueDate, maturityDate, interestRate, depositType, purpose,
        req.user!.userId, req.user!.userId
      ]);
      successCount++;
    } catch (insertErr: any) {
      errors.push({ row: rowNum, fdr_number: fdrNumber, error: insertErr.message });
    }
  }

  const summaryLog = `Ingested ${successCount} records successfully. Encountered ${errors.length} row exceptions.`;
  await executeMutation(`
    INSERT INTO bulk_ingestion_jobs (batch_reference, total_rows, successful_rows, failed_rows, validation_errors, uploaded_by, status)
    VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED')
  `, [`BATCH-${Date.now()}`, lines.length - 1, successCount, errors.length, JSON.stringify(errors.slice(0, 20)), req.user!.userId]);

  return res.json({
    success: true,
    total_rows: lines.length - 1,
    success_count: successCount,
    error_count: errors.length,
    errors,
    message: summaryLog
  });
});

export default router;
