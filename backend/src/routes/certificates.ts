import express from 'express';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { db } from '../db/database';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

export interface CertificateData {
  form_type: 'FORM_A' | 'FORM_B' | 'FORM_C' | 'FORM_D';
  form_title: string;
  certificate_number: string;
  issue_date: string;
  institution_name: string;
  aicte_id: string;
  fdr_number: string;
  bank_name: string;
  bank_branch: string;
  deposit_amount: number;
  deposit_amount_words: string;
  maturity_date: string;
  qr_code_url: string;
  dsc_sign_hash: string;
  signer_name: string;
  signer_designation: string;
  legal_provisions: string[];
}

function numberToIndianWords(num: number): string {
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if (num === 0) return 'Zero Rupees Only';

  function inWords(n: number): string {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + ' ' + a[n % 10];
    if (n < 1000) return inWords(Math.floor(n / 100)) + 'Hundred ' + inWords(n % 100);
    if (n < 100000) return inWords(Math.floor(n / 1000)) + 'Thousand ' + inWords(n % 1000);
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + 'Lakh ' + inWords(n % 100000);
    return inWords(Math.floor(n / 10000000)) + 'Crore ' + inWords(n % 10000000);
  }

  return 'Rupees ' + inWords(Math.floor(num)).trim() + ' Only';
}

// GET /api/certificates/:formType/:fdrId - Generate or retrieve statutory certificate
router.get('/:formType/:fdrId', authenticate, async (req: AuthRequest, res) => {
  const { formType, fdrId } = req.params;

  const fdr = await db.prepare(`
    SELECT f.*, i.name as institution_name, i.aicte_id, i.address, i.city, i.state
    FROM fdrs f
    JOIN institutions i ON f.institution_id = i.id
    WHERE f.id = ?
  `).get(fdrId) as any;

  if (!fdr) return res.status(404).json({ error: 'FDR not found' });

  // Role check
  if (req.user!.role === 'institution_user' && fdr.institution_id !== req.user!.institution_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const certTypeKey = (formType || 'FORM_C').toUpperCase();
  const certNumber = `AICTE/CERT/${certTypeKey}/${fdr.id}/${new Date().getFullYear()}`;

  // Generate cryptographic verification hash
  const certPayload = `${certNumber}|${fdr.fdr_number}|${fdr.deposit_amount}|${fdr.aicte_id}|${fdr.bank_name}`;
  const dscHash = '0x' + crypto.createHash('sha256').update(certPayload).digest('hex');

  // Generate QR Code containing verification metadata
  const qrVerificationPayload = JSON.stringify({
    portal: 'AICTE-SAFE-GOV-IN',
    cert_no: certNumber,
    aicte_id: fdr.aicte_id,
    fdr_no: fdr.fdr_number,
    amount: fdr.deposit_amount,
    bank: fdr.bank_name,
    dsc_hash: dscHash.slice(0, 18) + '...'
  });

  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(qrVerificationPayload, {
      errorCorrectionLevel: 'H',
      margin: 1,
      color: { dark: '#1e3a8a', light: '#ffffff' },
      width: 180
    });
  } catch (err) {
    console.error('Error generating QR code:', err);
  }

  // Titles and provisions per form
  let formTitle = 'COUNCIL STATUTORY LIEN DISCHARGE & RELEASE ORDER';
  let legalProvisions = [
    'Issued under the powers conferred by Section 10 of the All India Council for Technical Education Act, 1987.',
    'Certified that the statutory lock-in period and approval conditions have been fully satisfied by the institution.',
    'The issuing bank is hereby formally discharged of all Council liens and is authorized to release proceeds to the institution.'
  ];

  if (certTypeKey === 'FORM_A') {
    formTitle = 'AICTE STATUTORY JOINT-LIEN MARKING MANDATE TO ISSUING BANK';
    legalProvisions = [
      'In accordance with AICTE Approval Process Handbook (APH) regulations, the issuing bank is directed to mark an irrevocable exclusive first lien in favor of AICTE.',
      'No premature encashment, loan, pledge, or lien transfer shall be permitted without prior written discharge from AICTE.'
    ];
  } else if (certTypeKey === 'FORM_B') {
    formTitle = 'JOINT OPERATION & FIRST-LIEN ENDORSEMENT CERTIFICATE';
    legalProvisions = [
      'The designated Regional Officer of AICTE and the Authorized Institution Signatory shall operate the security instrument jointly.',
      'All interest accruals shall be governed strictly by Council guidelines.'
    ];
  } else if (certTypeKey === 'FORM_D') {
    formTitle = 'STATUTORY SHOW-CAUSE NOTICE FOR LAPSE / NON-RENEWAL OF SECURITY DEPOSIT';
    legalProvisions = [
      'The subject security deposit has matured / is approaching maturity without submission of prescribed renewal instrument.',
      'Notice is hereby given under Regulation 8 of Approval Process Handbook to show cause within 15 days why approval should not be withdrawn or deposit invoked.'
    ];
  }

  // Check or save to database
  const existingCert = await db.prepare('SELECT * FROM statutory_certificates WHERE certificate_number = ?').get(certNumber);
  if (!existingCert) {
    try {
      await db.prepare(`
        INSERT INTO statutory_certificates (certificate_type, fdr_id, institution_id, certificate_number, qr_verification_code, dsc_officer_name, dsc_officer_designation, pdf_payload)
        VALUES (?, ?, ?, ?, ?, 'Dr. Ramesh K. Unnikrishnan', 'Adviser (Approval Bureau), AICTE', ?)
      `).run(certTypeKey, fdr.id, fdr.institution_id, certNumber, dscHash, qrVerificationPayload);
    } catch (_) {}
  }

  const certificate: CertificateData = {
    form_type: certTypeKey as any,
    form_title: formTitle,
    certificate_number: certNumber,
    issue_date: new Date().toISOString().split('T')[0],
    institution_name: fdr.institution_name,
    aicte_id: fdr.aicte_id,
    fdr_number: fdr.fdr_number,
    bank_name: fdr.bank_name,
    bank_branch: fdr.bank_branch || 'Authorized Regulatory Branch',
    deposit_amount: fdr.deposit_amount,
    deposit_amount_words: numberToIndianWords(fdr.deposit_amount),
    maturity_date: fdr.maturity_date,
    qr_code_url: qrDataUrl,
    dsc_sign_hash: dscHash,
    signer_name: 'Dr. Ramesh K. Unnikrishnan',
    signer_designation: 'Adviser (Approval & Regulation Bureau), AICTE New Delhi',
    legal_provisions: legalProvisions
  };

  return res.json(certificate);
});

// GET /api/certificates/verify/:certNumber - Public verification check
router.get('/verify/:certNumber', async (req, res) => {
  const certNumber = decodeURIComponent(req.params.certNumber);
  const cert = await db.prepare(`
    SELECT sc.*, f.fdr_number, f.deposit_amount, f.bank_name, i.name as inst_name, i.aicte_id
    FROM statutory_certificates sc
    JOIN fdrs f ON sc.fdr_id = f.id
    JOIN institutions i ON sc.institution_id = i.id
    WHERE sc.certificate_number = ?
  `).get(certNumber) as any;

  if (!cert) {
    return res.status(404).json({
      verified: false,
      message: `Certificate "${certNumber}" is not recorded in the official AICTE National Register.`
    });
  }

  return res.json({
    verified: true,
    certificate_number: cert.certificate_number,
    certificate_type: cert.certificate_type,
    issued_at: cert.issued_at,
    institution: cert.inst_name,
    aicte_id: cert.aicte_id,
    fdr_number: cert.fdr_number,
    bank_name: cert.bank_name,
    deposit_amount: cert.deposit_amount,
    dsc_sign_hash: cert.dsc_sign_hash,
    status: 'OFFICIALLY_AUTHENTICATED'
  });
});

export default router;

