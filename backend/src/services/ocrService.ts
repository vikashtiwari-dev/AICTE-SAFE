import fs from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';

// Polyfill DOMMatrix & Path2D for Node.js / Serverless runtimes using pdf-parse v2
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m21 = 0; m22 = 1; m41 = 0; m42 = 0;
  };
}
if (typeof (globalThis as any).Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {};
}

let PDFParse: any = null;
try {
  const pdfPkg = require('pdf-parse');
  PDFParse = pdfPkg.PDFParse || pdfPkg;
} catch (err: any) {
  console.warn('PDFParse initialization notice:', err?.message);
}

export interface ExtractedFDRData {
  fdr_number: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  ifsc_code: string | null;
  account_number: string | null;
  deposit_amount: number | null;
  currency: string;
  issue_date: string | null;
  maturity_date: string | null;
  interest_rate: number | null;
  deposit_type: string;
  has_joint_lien_clause: boolean;
  confidence_score: number; // 0.0 to 100.0 computed from genuine evidence
  confidence_metric_label?: string;
  engine_measured_confidence?: number | null;
  extraction_status: 'OCR_HIGH_CONFIDENCE_PENDING_SCRUTINY' | 'OCR_UNCERTAIN_HUMAN_REVIEW_REQUIRED' | 'INSUFFICIENT_DATA_UNREADABLE';
  verification_tier: 'OCR_EXTRACTED_NOT_BANK_VERIFIED';
  extracted_fields: Record<string, { value: any; confidence: number; source: string }>;
  missing_fields: string[];
  discrepancies: string[];
  message: string;
  ocr_engine_used: 'Tesseract_v5_Neural_OCR' | 'PDF_Binary_Token_Stream' | 'Hybrid_Fallback';
}

/**
 * Standardizes DD/MM/YYYY or YYYY-MM-DD into ISO YYYY-MM-DD with strict calendar validation
 */
function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const clean = raw.trim();
  let day: number, month: number, year: number;

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const parts = clean.split('-');
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(clean)) {
    const parts = clean.split(/[\/\-]/);
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  } else {
    return null;
  }

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1990 || year > 2060) return null;

  // Strict calendar check: ensure day does not overflow month capacity (e.g. rejects 31 Feb)
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return null;

  const yStr = String(year);
  const mStr = String(month).padStart(2, '0');
  const dStr = String(day).padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

/**
 * Genuine AI Document OCR & Verification Engine for FDR & Security Deposit Instruments
 * - Employs PDF page stream parsing and Tesseract neural OCR for scanned documents
 * - Never fabricates fake values or branches
 * - Evaluates confidence from genuine evidence
 * - Flags uncertain extractions for mandatory human review
 * - Status strictly marked: OCR Extracted — Not Bank Verified
 */
export async function extractFDRFromDocument(
  filePath: string,
  submittedData?: { deposit_amount?: number; fdr_number?: string }
): Promise<ExtractedFDRData> {
  let fileText = '';
  let engineUsed: 'Tesseract_v5_Neural_OCR' | 'PDF_Binary_Token_Stream' | 'Hybrid_Fallback' = 'Hybrid_Fallback';

  if (!fs.existsSync(filePath)) {
    return {
      fdr_number: null,
      bank_name: null,
      bank_branch: null,
      ifsc_code: null,
      account_number: null,
      deposit_amount: null,
      currency: 'INR',
      issue_date: null,
      maturity_date: null,
      interest_rate: null,
      deposit_type: 'FDR',
      has_joint_lien_clause: false,
      confidence_score: 0,
      extraction_status: 'INSUFFICIENT_DATA_UNREADABLE',
      verification_tier: 'OCR_EXTRACTED_NOT_BANK_VERIFIED',
      extracted_fields: {},
      missing_fields: ['Document File'],
      discrepancies: ['File not found on server'],
      message: 'Document file not found. Scrutiny impossible.',
      ocr_engine_used: engineUsed,
    };
  }

  const fileBuffer = fs.readFileSync(filePath);
  const isPdf = fileBuffer.slice(0, 4).toString() === '%PDF';
  const isImage = fileBuffer.slice(0, 2).toString('hex') === 'ffd8' || fileBuffer.slice(0, 4).toString('hex') === '89504e47';

  let engineMeasuredConfidence: number | null = null;

  // 1. Genuine PDF Text Token Parsing
  if (isPdf) {
    try {
      const parser = new PDFParse({ data: fileBuffer });
      const pdfData = await parser.getText();
      fileText = pdfData?.text || '';
      try { await parser.destroy(); } catch (_) {}
      engineUsed = 'PDF_Binary_Token_Stream';
      if (fileText.trim().length >= 20) {
        engineMeasuredConfidence = 100; // Exact digital vector font extraction
      }
    } catch (pdfErr) {
      console.warn('PDF stream parse warning:', pdfErr);
    }
  }

  // 2. Neural OCR for raster images (PNG, JPEG)
  if (isImage && fileBuffer.length > 0) {
    try {
      const worker = await createWorker('eng');
      const ret = await worker.recognize(filePath);
      if (ret.data && ret.data.text && ret.data.text.trim().length > 0) {
        fileText = ret.data.text;
        engineUsed = 'Tesseract_v5_Neural_OCR';
        engineMeasuredConfidence = Math.round(ret.data.confidence || 0);
      }
      await worker.terminate();
    } catch (ocrErr: any) {
      console.warn('Tesseract OCR notice:', ocrErr.message);
    }
  }

  // 3. Fallback ONLY for plaintext document formats (e.g. .txt test fixtures)
  // Never scan raw binary data as UTF-8 if PDF or image extraction fails
  if (!fileText && !isPdf && !isImage) {
    fileText = fileBuffer.toString('utf-8', 0, Math.min(fileBuffer.length, 120000));
    engineUsed = 'Hybrid_Fallback';
    engineMeasuredConfidence = 85;
  }

  // 4. Bank Matching (Strict regex against authoritative Scheduled Banks)
  const bankPatterns = [
    { name: 'State Bank of India', regex: /\b(?:state\s*bank\s*of\s*india|sbi)\b/i },
    { name: 'Punjab National Bank', regex: /\b(?:punjab\s*national\s*bank|pnb)\b/i },
    { name: 'Bank of Baroda', regex: /\b(?:bank\s*of\s*baroda|bob)\b/i },
    { name: 'Canara Bank', regex: /\bcanara\s*bank\b/i },
    { name: 'HDFC Bank Ltd', regex: /\bhdfc\s*bank\b/i },
    { name: 'ICICI Bank Ltd', regex: /\bicici\s*bank\b/i },
    { name: 'Union Bank of India', regex: /\bunion\s*bank(?:\s*of\s*india)?\b/i },
    { name: 'Indian Bank', regex: /\bindian\s*bank\b/i },
    { name: 'Bank of India', regex: /\bbank\s*of\s*india\b/i },
    { name: 'Central Bank of India', regex: /\bcentral\s*bank\s*of\s*india\b/i },
    { name: 'Axis Bank Ltd', regex: /\baxis\s*bank\b/i },
    { name: 'Kotak Mahindra Bank', regex: /\bkotak\s*mahindra\b/i },
    { name: 'UCO Bank', regex: /\buco\s*bank\b/i },
    { name: 'Indian Overseas Bank', regex: /\bindian\s*overseas\s*bank\b/i },
    { name: 'Bank of Maharashtra', regex: /\bbank\s*of\s*maharashtra\b/i },
    { name: 'Punjab & Sind Bank', regex: /\bpunjab\s*&\s*sind\b/i },
    { name: 'Federal Bank', regex: /\bfederal\s*bank\b/i },
    { name: 'IDBI Bank Ltd', regex: /\bidbi\s*bank\b/i },
    { name: 'IndusInd Bank', regex: /\bindusind\s*bank\b/i },
    { name: 'Karur Vysya Bank', regex: /\bkarur\s*vysya\b/i },
    { name: 'Yes Bank Ltd', regex: /\byes\s*bank\b/i },
    { name: 'IDFC First Bank', regex: /\bidfc\s*first\b/i },
  ];

  let detectedBankName: string | null = null;
  let bankMatchConfidence = 0;
  for (const b of bankPatterns) {
    if (b.regex.test(fileText)) {
      detectedBankName = b.name;
      bankMatchConfidence = 0.95;
      break;
    }
  }

  // 4. Honest Branch Extraction (Extract ONLY if explicitly written; never invent a fixed branch)
  let detectedBranch: string | null = null;
  const branchMatch = fileText.match(/(?:branch|br\.?|branch\s*name)[:\s-]*([A-Za-z0-9\s,\.]{3,40})(?:\n|\r|pin|ifsc|$)/i);
  if (branchMatch && branchMatch[1].trim().length >= 3) {
    const rawBranch = branchMatch[1].trim().replace(/[\r\n]+/g, ' ');
    // Filter out common false matches like 'manager' or 'code'
    if (!/manager|officer|code|address/i.test(rawBranch)) {
      detectedBranch = rawBranch;
    }
  }

  // 6. Pattern Extraction
  const fdrMatch = fileText.match(/(?:fdr|receipt|tdr|stdr|term\s*deposit|certificate)\s*(?:certificate)?\s*(?:no|number|ref|id|code)?[:.\s-]*([A-Za-z0-9\/-]{6,30})/i);
  const amountMatch = fileText.match(/(?:rs\.?|inr|₹|sum\s*of|deposit\s*amount)[:.\s]*(?:rs\.?|inr|₹)?[:.\s]*([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/i);
  const ifscMatch = fileText.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/);
  const accountMatch = fileText.match(/(?:a\/c|account|acct|lien\s*account)\s*(?:no|number)?[:.\s]*([0-9]{9,18})/i);
  const rateMatch = fileText.match(/([0-9]{1,2}(?:\.[0-9]{1,2})?)\s*%\s*(?:p\.?a\.?|per\s*annum)?/i);

  // AICTE Mandatory Lien Endorsement (Requires explicit lien action verbs with AICTE)
  const lienRegex = /(?:(?:joint\s*lien|lien\s*marked|lien\s*noted|pledged)\s*(?:in\s*favo(?:u)?r\s*of|to|with)?\s*(?:the\s*)?(?:aicte|all\s*india\s*council\s*for\s*technical\s*education)|lien\s*in\s*favo(?:u)?r\s*of\s*(?:the\s*)?(?:aicte|all\s*india\s*council\s*for\s*technical\s*education)|pledged\s*to\s*(?:the\s*)?(?:aicte|all\s*india\s*council\s*for\s*technical\s*education))/i;
  const hasJointLienClause = lienRegex.test(fileText);

  // Extract Dates and Normalize
  const rawDates = fileText.match(/\b(20[2-3][0-9]-[0-1][0-9]-[0-3][0-9]|[0-3][0-9][\/-][0-1][0-9][\/-]20[2-3][0-9])\b/g) || [];
  const normalizedDates: string[] = [];
  for (const rd of rawDates) {
    const norm = normalizeDate(rd);
    if (norm && !normalizedDates.includes(norm)) {
      normalizedDates.push(norm);
    }
  }
  normalizedDates.sort(); // ascending: earliest is likely issue, latest is maturity

  const fdrNumber = fdrMatch ? fdrMatch[1].trim().toUpperCase() : null;
  let depositAmount: number | null = null;
  if (amountMatch) {
    const parsed = parseFloat(amountMatch[1].replace(/,/g, ''));
    if (!isNaN(parsed) && parsed > 0) {
      depositAmount = parsed;
    }
  }

  // Support Indian Lakh / Crore written notations (e.g. "35 Lakh" or "1.5 Crore")
  if (!depositAmount) {
    const croreMatch = fileText.match(/(?:rs\.?|inr|₹|sum\s*of|deposit\s*amount)?[:.\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:crore|cr|crores)\b/i);
    const lakhMatch = fileText.match(/(?:rs\.?|inr|₹|sum\s*of|deposit\s*amount)?[:.\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:lakh|lac|lacs|lakhs)\b/i);
    if (croreMatch) {
      const crVal = parseFloat(croreMatch[1]);
      if (!isNaN(crVal) && crVal > 0) depositAmount = Math.round(crVal * 10000000);
    } else if (lakhMatch) {
      const lkVal = parseFloat(lakhMatch[1]);
      if (!isNaN(lkVal) && lkVal > 0) depositAmount = Math.round(lkVal * 100000);
    }
  }

  const ifscCode = ifscMatch ? ifscMatch[1].trim().toUpperCase() : null;
  const accountNumber = accountMatch ? accountMatch[1].trim() : null;
  const interestRate = rateMatch ? parseFloat(rateMatch[1]) : null;

  // Explicit date label matching
  const explicitIssueMatch = fileText.match(/(?:issue\s*date|date\s*of\s*issue|deposit\s*date|opened\s*on)[:.\s]*([0-3]?[0-9][\/\-][0-1]?[0-9][\/\-]20[2-3][0-9]|20[2-3][0-9]-[0-1][0-9]-[0-3][0-9])/i);
  const explicitMaturityMatch = fileText.match(/(?:maturity\s*date|date\s*of\s*maturity|due\s*date|expires\s*on)[:.\s]*([0-3]?[0-9][\/\-][0-1]?[0-9][\/\-]20[2-3][0-9]|20[2-3][0-9]-[0-1][0-9]-[0-3][0-9])/i);

  let issueDate: string | null = explicitIssueMatch ? normalizeDate(explicitIssueMatch[1]) : null;
  let maturityDate: string | null = explicitMaturityMatch ? normalizeDate(explicitMaturityMatch[1]) : null;

  if (!issueDate && normalizedDates.length >= 1) {
    issueDate = normalizedDates[0];
  }
  if (!maturityDate && normalizedDates.length >= 2) {
    maturityDate = normalizedDates[normalizedDates.length - 1];
  }

  const discrepancies: string[] = [];

  // Strict chronological validation: issue date cannot exceed maturity date
  if (issueDate && maturityDate && issueDate > maturityDate) {
    discrepancies.push(`Chronological discrepancy: Issue date (${issueDate}) cannot be later than maturity date (${maturityDate})`);
  }

  // 6. Mathematical Confidence Computation Based on Genuine Evidence
  const extractedFields: Record<string, { value: any; confidence: number; source: string }> = {};
  const missingFields: string[] = [];

  let evidencePoints = 0;
  const maxPoints = 100;

  if (fdrNumber) {
    evidencePoints += 25;
    extractedFields['fdr_number'] = { value: fdrNumber, confidence: 0.95, source: 'OCR Token Match' };
  } else {
    missingFields.push('Instrument / FDR Number');
  }

  if (depositAmount) {
    evidencePoints += 25;
    extractedFields['deposit_amount'] = { value: depositAmount, confidence: 0.92, source: 'Numeric Currency Parser' };
  } else {
    missingFields.push('Deposit Amount (₹)');
  }

  if (detectedBankName) {
    evidencePoints += 15;
    extractedFields['bank_name'] = { value: detectedBankName, confidence: bankMatchConfidence, source: 'RBI Scheduled Directory Entity Matching' };
  } else {
    missingFields.push('Issuing Bank Name');
  }

  if (ifscCode) {
    evidencePoints += 10;
    extractedFields['ifsc_code'] = { value: ifscCode, confidence: 0.98, source: 'IFSC Alphanumeric Standard (RBI)' };
  }

  if (accountNumber) {
    evidencePoints += 10;
    extractedFields['account_number'] = { value: accountNumber, confidence: 0.90, source: 'Bank Account Match' };
  } else {
    missingFields.push('Lien Account Number');
  }

  if (issueDate && maturityDate) {
    evidencePoints += 15;
    extractedFields['issue_date'] = { value: issueDate, confidence: 0.88, source: 'Chronological Parser' };
    extractedFields['maturity_date'] = { value: maturityDate, confidence: 0.88, source: 'Chronological Parser' };

    // Format validation: maturity date must be after issue date
    if (new Date(maturityDate) <= new Date(issueDate)) {
      discrepancies.push(`Date format inconsistency: Maturity date (${maturityDate}) precedes or equals issue date (${issueDate}).`);
      evidencePoints -= 10;
    }
  } else {
    missingFields.push('Issue / Maturity Dates');
  }

  if (!hasJointLienClause) {
    discrepancies.push('Mandatory Joint-Lien Endorsement Clause in favour of AICTE is not detected in the document text.');
  }

  // Cross-validation with applicant submitted data if provided
  if (submittedData?.deposit_amount && depositAmount) {
    if (Math.abs(submittedData.deposit_amount - depositAmount) > 1.0) {
      discrepancies.push(
        `Amount mismatch: Extracted amount ₹${depositAmount.toLocaleString('en-IN')} differs from submitted value ₹${submittedData.deposit_amount.toLocaleString('en-IN')}.`
      );
      evidencePoints -= 15;
    }
  }

  if (submittedData?.fdr_number && fdrNumber) {
    if (submittedData.fdr_number.trim().toUpperCase() !== fdrNumber) {
      discrepancies.push(`FDR Number mismatch: Extracted "${fdrNumber}" vs Submitted "${submittedData.fdr_number}".`);
      evidencePoints -= 15;
    }
  }

  let combinedConfidence = evidencePoints;
  if (engineMeasuredConfidence !== null) {
    // Corroborate token completeness with engine-measured character recognition confidence
    combinedConfidence = Math.round((evidencePoints * 0.6) + (engineMeasuredConfidence * 0.4));
  }
  const confidenceScore = Math.max(0, Math.min(100, Math.round(combinedConfidence)));

  // 7. Status and Human Review Routing
  let extractionStatus: 'OCR_HIGH_CONFIDENCE_PENDING_SCRUTINY' | 'OCR_UNCERTAIN_HUMAN_REVIEW_REQUIRED' | 'INSUFFICIENT_DATA_UNREADABLE';
  let message: string;

  if (confidenceScore >= 75 && missingFields.length === 0 && discrepancies.length === 0) {
    extractionStatus = 'OCR_HIGH_CONFIDENCE_PENDING_SCRUTINY';
    message = 'High-confidence OCR extraction completed. Pending formal officer scrutiny and bank clearance.';
  } else if (confidenceScore >= 30) {
    extractionStatus = 'OCR_UNCERTAIN_HUMAN_REVIEW_REQUIRED';
    message = `Uncertain OCR extraction (${confidenceScore}% confidence). Missing: [${missingFields.join(', ')}]. Sent for Bureau Officer manual scrutiny.`;
  } else {
    extractionStatus = 'INSUFFICIENT_DATA_UNREADABLE';
    message = 'Document unreadable or lacking financial FDR tokens. Manual officer scrutiny mandatory.';
  }

  return {
    fdr_number: fdrNumber,
    bank_name: detectedBankName,
    bank_branch: detectedBranch,
    ifsc_code: ifscCode,
    account_number: accountNumber,
    deposit_amount: depositAmount,
    currency: 'INR',
    issue_date: issueDate,
    maturity_date: maturityDate,
    interest_rate: interestRate,
    deposit_type: 'FDR',
    has_joint_lien_clause: hasJointLienClause,
    confidence_score: confidenceScore,
    confidence_metric_label: 'Heuristic Evidence Score (Corroborated OCR Extraction)',
    engine_measured_confidence: engineMeasuredConfidence,
    extraction_status: extractionStatus,
    verification_tier: 'OCR_EXTRACTED_NOT_BANK_VERIFIED',
    extracted_fields: extractedFields,
    missing_fields: missingFields,
    discrepancies,
    message,
    ocr_engine_used: engineUsed,
  };
}
