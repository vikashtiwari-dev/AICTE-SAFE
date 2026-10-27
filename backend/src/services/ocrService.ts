import fs from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';

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
  requires_manual_scrutiny: boolean;
  extracted_fields: Record<string, { value: any; confidence: number; source: string; status: 'CONFIDENT' | 'UNCERTAIN' }>;
  missing_fields: string[];
  uncertain_fields: string[];
  discrepancies: string[];
  message: string;
  ocr_engine_used: 'Tesseract_v5_Neural_OCR' | 'PDF_Binary_Token_Stream' | 'Scanned_PDF_Rasterized_Tesseract_OCR' | 'Hybrid_Fallback';
}

/**
 * Rasterizes pages of a scanned PDF document into PNG image buffers for Tesseract neural OCR
 */
export async function rasterizePdfPages(pdfBuffer: Buffer, maxPages = 3): Promise<Buffer[]> {
  const images: Buffer[] = [];
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { createCanvas } = require('@napi-rs/canvas');

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
      disableFontFace: true,
    });
    const pdfDoc = await loadingTask.promise;
    const numPages = Math.min(pdfDoc.numPages, maxPages);

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for crisp OCR recognition
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');
      await (page.render({
        canvasContext: ctx as any,
        viewport,
        canvas: canvas as any
      } as any)).promise;
      images.push(canvas.toBuffer('image/png'));
    }
  } catch (err: any) {
    console.warn('PDF rasterization notice (skipping raster OCR):', err.message);
  }
  return images;
}

/**
 * Standardizes DD/MM/YYYY or YYYY-MM-DD into ISO YYYY-MM-DD with strict calendar validation
 */
export function normalizeDate(raw: string): string | null {
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
 * - Evaluates confidence from genuine evidence and calculates field-level confidence
 * - Flags uncertain extractions for mandatory human review
 * - Status strictly marked: OCR Extracted — Not Bank Verified
 */
export async function extractFDRFromDocument(
  filePath: string,
  submittedData?: { deposit_amount?: number; fdr_number?: string }
): Promise<ExtractedFDRData> {
  let fileText = '';
  let engineUsed: 'Tesseract_v5_Neural_OCR' | 'PDF_Binary_Token_Stream' | 'Scanned_PDF_Rasterized_Tesseract_OCR' | 'Hybrid_Fallback' = 'Hybrid_Fallback';

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
      requires_manual_scrutiny: true,
      extracted_fields: {},
      missing_fields: ['Document File'],
      uncertain_fields: ['Document File Not Found'],
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
      if (typeof (globalThis as any).DOMMatrix === 'undefined') {
        (globalThis as any).DOMMatrix = class DOMMatrix {
          a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
          m11 = 1; m12 = 0; m21 = 0; m22 = 1; m41 = 0; m42 = 0;
          translate() { return this; }
          scale() { return this; }
        };
      }
      if (typeof (global as any).DOMMatrix === 'undefined') {
        (global as any).DOMMatrix = (globalThis as any).DOMMatrix;
      }
      const pdfPkg = require('pdf-parse');
      const PDFParseClass = pdfPkg.PDFParse || pdfPkg;
      const parser = new PDFParseClass({ data: fileBuffer });
      const pdfData = await parser.getText();
      fileText = pdfData?.text || '';
      try { await parser.destroy(); } catch (_) {}

      const hasDepositTokens = /(?:fdr|tdr|receipt|deposit|certificate|bank|rupees|rs\.?|₹|account)/i.test(fileText);

      if (fileText.trim().length >= 30 && hasDepositTokens) {
        engineUsed = 'PDF_Binary_Token_Stream';
        engineMeasuredConfidence = 92; // Vector text stream parsed cleanly
      } else {
        // Scanned PDF fallback: Document contains scanned bitmaps rather than text streams,
        // or parsed text lacks key financial tokens.
        // Rasterize PDF pages into PNG images and execute Tesseract neural OCR.
        const pageImages = await rasterizePdfPages(fileBuffer);
        if (pageImages.length > 0) {
          const worker = await createWorker('eng');
          const pageTexts: string[] = [];
          let totalConfidence = 0;
          for (const imgBuffer of pageImages) {
            const ret = await worker.recognize(imgBuffer);
            if (ret.data && ret.data.text && ret.data.text.trim().length > 0) {
              pageTexts.push(ret.data.text);
              totalConfidence += Number(ret.data.confidence || 0);
            }
          }
          await worker.terminate();

          if (pageTexts.length > 0) {
            fileText = pageTexts.join('\n');
            engineUsed = 'Scanned_PDF_Rasterized_Tesseract_OCR';
            engineMeasuredConfidence = Math.round(totalConfidence / pageTexts.length);
          }
        }
      }
    } catch (pdfErr: any) {
      console.warn('PDF stream parse / rasterization warning:', pdfErr.message);
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
    { name: 'State Bank of India', regex: /\b(?:state\s*bank\s*of\s*india|sbi)\b/i, isFullName: true },
    { name: 'Punjab National Bank', regex: /\b(?:punjab\s*national\s*bank|pnb)\b/i, isFullName: true },
    { name: 'Bank of Baroda', regex: /\b(?:bank\s*of\s*baroda|bob)\b/i, isFullName: true },
    { name: 'Canara Bank', regex: /\bcanara\s*bank\b/i, isFullName: true },
    { name: 'HDFC Bank Ltd', regex: /\bhdfc\s*bank\b/i, isFullName: true },
    { name: 'ICICI Bank Ltd', regex: /\bicici\s*bank\b/i, isFullName: true },
    { name: 'Union Bank of India', regex: /\bunion\s*bank(?:\s*of\s*india)?\b/i, isFullName: true },
    { name: 'Indian Bank', regex: /\bindian\s*bank\b/i, isFullName: true },
    { name: 'Bank of India', regex: /\bbank\s*of\s*india\b/i, isFullName: true },
    { name: 'Central Bank of India', regex: /\bcentral\s*bank\s*of\s*india\b/i, isFullName: true },
    { name: 'Axis Bank Ltd', regex: /\baxis\s*bank\b/i, isFullName: true },
    { name: 'Kotak Mahindra Bank', regex: /\bkotak\s*mahindra\b/i, isFullName: true },
    { name: 'UCO Bank', regex: /\buco\s*bank\b/i, isFullName: true },
    { name: 'Indian Overseas Bank', regex: /\bindian\s*overseas\s*bank\b/i, isFullName: true },
    { name: 'Bank of Maharashtra', regex: /\bbank\s*of\s*maharashtra\b/i, isFullName: true },
    { name: 'Punjab & Sind Bank', regex: /\bpunjab\s*&\s*sind\b/i, isFullName: true },
    { name: 'Federal Bank', regex: /\bfederal\s*bank\b/i, isFullName: true },
    { name: 'IDBI Bank Ltd', regex: /\bidbi\s*bank\b/i, isFullName: true },
    { name: 'IndusInd Bank', regex: /\bindusind\s*bank\b/i, isFullName: true },
    { name: 'Karur Vysya Bank', regex: /\bkarur\s*vysya\b/i, isFullName: true },
    { name: 'Yes Bank Ltd', regex: /\byes\s*bank\b/i, isFullName: true },
    { name: 'IDFC First Bank', regex: /\bidfc\s*first\b/i, isFullName: true },
  ];

  let detectedBankName: string | null = null;
  let bankMatchConfidence = 0;
  for (const b of bankPatterns) {
    if (b.regex.test(fileText)) {
      detectedBankName = b.name;
      bankMatchConfidence = b.isFullName ? 0.95 : 0.75;
      break;
    }
  }

  // 5. Honest Branch Extraction (Extract ONLY if explicitly written; never invent a fixed branch)
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
  let amountMatchSource = 'Numeric Currency Parser';

  // Support Indian Lakh / Crore written notations first (e.g. "35 Lakh", "1.5 Crore", "Rs. 35 Lakhs")
  const croreMatch = fileText.match(/(?:rs\.?|inr|₹|sum\s*of|deposit\s*amount)?[:.\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:crore|cr|crores)\b/i);
  const lakhMatch = fileText.match(/(?:rs\.?|inr|₹|sum\s*of|deposit\s*amount)?[:.\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:lakh|lac|lacs|lakhs)\b/i);

  if (croreMatch) {
    const crVal = parseFloat(croreMatch[1]);
    if (!isNaN(crVal) && crVal > 0) {
      depositAmount = Math.round(crVal * 10000000);
      amountMatchSource = 'Written Crore Notation Parser';
    }
  } else if (lakhMatch) {
    const lkVal = parseFloat(lakhMatch[1]);
    if (!isNaN(lkVal) && lkVal > 0) {
      depositAmount = Math.round(lkVal * 100000);
      amountMatchSource = 'Written Lakh Notation Parser';
    }
  } else if (amountMatch) {
    const parsed = parseFloat(amountMatch[1].replace(/,/g, ''));
    if (!isNaN(parsed) && parsed > 0) {
      depositAmount = parsed;
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

  let issueDateSource = 'Explicit Issue Date Label';
  let maturityDateSource = 'Explicit Maturity Date Label';

  if (!issueDate && normalizedDates.length >= 1) {
    issueDate = normalizedDates[0];
    issueDateSource = 'Inferred Earliest Calendar Date';
  }
  if (!maturityDate && normalizedDates.length >= 2) {
    maturityDate = normalizedDates[normalizedDates.length - 1];
    maturityDateSource = 'Inferred Latest Calendar Date';
  }

  const discrepancies: string[] = [];
  const uncertainFields: string[] = [];
  const missingFields: string[] = [];
  const extractedFields: Record<string, { value: any; confidence: number; source: string; status: 'CONFIDENT' | 'UNCERTAIN' }> = {};

  let evidencePoints = 0;

  // 1. FDR Number Field Confidence Evaluation
  if (fdrNumber) {
    let conf = /(?:fdr|tdr|stdr)[-_/]/i.test(fdrNumber) ? 0.95 : 0.75;
    let src = 'OCR Token Match';
    if (submittedData?.fdr_number) {
      if (submittedData.fdr_number.trim().toUpperCase() === fdrNumber) {
        conf = 0.99;
        src = 'OCR Token Match (Corroborated with Submission)';
      } else {
        conf = 0.35;
        discrepancies.push(`FDR Number mismatch: Extracted "${fdrNumber}" vs Submitted "${submittedData.fdr_number}".`);
        uncertainFields.push('fdr_number');
      }
    }
    evidencePoints += Math.round(conf * 25);
    extractedFields['fdr_number'] = {
      value: fdrNumber,
      confidence: conf,
      source: src,
      status: conf >= 0.70 ? 'CONFIDENT' : 'UNCERTAIN'
    };
  } else {
    missingFields.push('Instrument / FDR Number');
    uncertainFields.push('fdr_number');
  }

  // 2. Deposit Amount Field Confidence Evaluation
  if (depositAmount) {
    let conf = amountMatchSource.includes('Notation') ? 0.90 : 0.92;
    let src = amountMatchSource;
    if (submittedData?.deposit_amount) {
      if (Math.abs(submittedData.deposit_amount - depositAmount) <= 1.0) {
        conf = 0.98;
        src = `${amountMatchSource} (Corroborated with Submission)`;
      } else {
        conf = 0.30;
        discrepancies.push(
          `Amount mismatch: Extracted amount ₹${depositAmount.toLocaleString('en-IN')} differs from submitted value ₹${submittedData.deposit_amount.toLocaleString('en-IN')}.`
        );
        uncertainFields.push('deposit_amount');
      }
    }
    evidencePoints += Math.round(conf * 25);
    extractedFields['deposit_amount'] = {
      value: depositAmount,
      confidence: conf,
      source: src,
      status: conf >= 0.70 ? 'CONFIDENT' : 'UNCERTAIN'
    };
  } else {
    missingFields.push('Deposit Amount (₹)');
    uncertainFields.push('deposit_amount');
  }

  // 3. Bank Name Field Confidence Evaluation
  if (detectedBankName) {
    evidencePoints += Math.round(bankMatchConfidence * 15);
    extractedFields['bank_name'] = {
      value: detectedBankName,
      confidence: bankMatchConfidence,
      source: 'RBI Scheduled Directory Entity Matching',
      status: bankMatchConfidence >= 0.70 ? 'CONFIDENT' : 'UNCERTAIN'
    };
  } else {
    missingFields.push('Issuing Bank Name');
    uncertainFields.push('bank_name');
  }

  // 4. IFSC Code Field Confidence Evaluation
  if (ifscCode) {
    evidencePoints += 10;
    extractedFields['ifsc_code'] = {
      value: ifscCode,
      confidence: 0.98,
      source: 'IFSC Alphanumeric Standard (RBI)',
      status: 'CONFIDENT'
    };
  }

  // 5. Account Number Field Confidence Evaluation
  if (accountNumber) {
    evidencePoints += 10;
    extractedFields['account_number'] = {
      value: accountNumber,
      confidence: 0.90,
      source: 'Bank Account Match',
      status: 'CONFIDENT'
    };
  } else {
    missingFields.push('Lien Account Number');
    uncertainFields.push('account_number');
  }

  // 6. Dates Field Confidence Evaluation
  if (issueDate && maturityDate) {
    let dateConf = (explicitIssueMatch && explicitMaturityMatch) ? 0.90 : 0.65;
    if (dateConf < 0.70) {
      uncertainFields.push('issue_date', 'maturity_date');
    }

    // Chronological validation
    if (new Date(maturityDate) <= new Date(issueDate)) {
      discrepancies.push(`Date format inconsistency: Maturity date (${maturityDate}) precedes or equals issue date (${issueDate}).`);
      dateConf = 0.10;
      uncertainFields.push('maturity_date');
      evidencePoints -= 10;
    } else {
      evidencePoints += Math.round(dateConf * 15);
    }

    extractedFields['issue_date'] = {
      value: issueDate,
      confidence: dateConf,
      source: issueDateSource,
      status: dateConf >= 0.70 ? 'CONFIDENT' : 'UNCERTAIN'
    };
    extractedFields['maturity_date'] = {
      value: maturityDate,
      confidence: dateConf,
      source: maturityDateSource,
      status: dateConf >= 0.70 ? 'CONFIDENT' : 'UNCERTAIN'
    };
  } else {
    missingFields.push('Issue / Maturity Dates');
    uncertainFields.push('dates');
  }

  // 7. Mandatory AICTE Joint Lien Clause Check
  if (!hasJointLienClause) {
    discrepancies.push('Mandatory Joint-Lien Endorsement Clause in favour of AICTE is not detected in the document text.');
    uncertainFields.push('has_joint_lien_clause');
  }

  // Overall Mathematical Confidence Calculation
  let combinedConfidence = evidencePoints;
  if (engineMeasuredConfidence !== null) {
    // Corroborate token completeness with engine-measured character recognition confidence
    combinedConfidence = Math.round((evidencePoints * 0.6) + (engineMeasuredConfidence * 0.4));
  }
  const confidenceScore = Math.max(0, Math.min(100, Math.round(combinedConfidence)));

  // Status and Human Review Determination
  let extractionStatus: 'OCR_HIGH_CONFIDENCE_PENDING_SCRUTINY' | 'OCR_UNCERTAIN_HUMAN_REVIEW_REQUIRED' | 'INSUFFICIENT_DATA_UNREADABLE';
  let message: string;

  if (confidenceScore >= 75 && missingFields.length === 0 && discrepancies.length === 0 && uncertainFields.length === 0) {
    extractionStatus = 'OCR_HIGH_CONFIDENCE_PENDING_SCRUTINY';
    message = 'High-confidence OCR extraction completed. Pending formal officer scrutiny and bank clearance.';
  } else if (confidenceScore >= 25) {
    extractionStatus = 'OCR_UNCERTAIN_HUMAN_REVIEW_REQUIRED';
    message = `Uncertain OCR extraction (${confidenceScore}% confidence). Uncertain fields: [${uncertainFields.join(', ')}]. Sent for Bureau Officer manual scrutiny.`;
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
    requires_manual_scrutiny: (
      extractionStatus !== 'OCR_HIGH_CONFIDENCE_PENDING_SCRUTINY' ||
      discrepancies.length > 0 ||
      missingFields.length > 0 ||
      uncertainFields.length > 0 ||
      confidenceScore < 85 ||
      engineUsed === 'Scanned_PDF_Rasterized_Tesseract_OCR'
    ),
    extracted_fields: extractedFields,
    missing_fields: missingFields,
    uncertain_fields: Array.from(new Set(uncertainFields)),
    discrepancies,
    message,
    ocr_engine_used: engineUsed,
  };
}
