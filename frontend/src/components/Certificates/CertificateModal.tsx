import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import { CertificateData } from '../../types';
import { Modal } from '../ui/Modal';
import { ShieldCheck, Printer, Download, QrCode, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';

interface CertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  fdrId: number;
  initialType?: 'FORM_A' | 'FORM_B' | 'FORM_C' | 'FORM_D';
}

export const CertificateModal: React.FC<CertificateModalProps> = ({
  isOpen,
  onClose,
  fdrId,
  initialType = 'FORM_C',
}) => {
  const [certType, setCertType] = useState<'FORM_A' | 'FORM_B' | 'FORM_C' | 'FORM_D'>(initialType);
  const [cert, setCert] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && fdrId) {
      fetchCertificate(certType);
    }
  }, [isOpen, fdrId, certType]);

  const fetchCertificate = async (type: string) => {
    try {
      setLoading(true);
      const res = await api.get(`/certificates/${type}/${fdrId}`);
      setCert(res.data);
    } catch (err) {
      console.error('Failed to load certificate:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Statutory Regulatory Document & Certificate Generator" maxWidth="max-w-4xl">
      <div className="space-y-4">
        {/* Form Selection Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setCertType('FORM_C')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              certType === 'FORM_C' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Form C: Council Lien Discharge Order
          </button>
          <button
            type="button"
            onClick={() => setCertType('FORM_A')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              certType === 'FORM_A' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Form A: Bank Joint-Lien Mandate
          </button>
          <button
            type="button"
            onClick={() => setCertType('FORM_B')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              certType === 'FORM_B' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Form B: Joint Endorsement Certificate
          </button>
          <button
            type="button"
            onClick={() => setCertType('FORM_D')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              certType === 'FORM_D' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Form D: Non-Renewal Show-Cause Notice
          </button>
        </div>

        {loading || !cert ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
            <p className="text-xs">Generating Cryptographically Verified Certificate with QR Stamp...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Printable Document Sheet */}
            <div id="statutory-certificate-sheet" className="p-8 bg-white border-2 border-slate-800 rounded-xl shadow-inner space-y-6 text-slate-800 font-serif">
              {/* Official AICTE Letterhead */}
              <div className="text-center border-b-2 border-slate-800 pb-4">
                <div className="text-xs uppercase tracking-widest text-slate-500 font-sans font-bold">
                  Government of India • Ministry of Education
                </div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 mt-1 uppercase">
                  All India Council for Technical Education
                </h1>
                <p className="text-xs text-slate-600 font-sans mt-0.5">
                  Nelson Mandela Marg, Vasant Kunj, New Delhi - 110070 • Regulation & Approval Bureau
                </p>
                <div className="mt-3 inline-block px-4 py-1 bg-slate-900 text-white text-xs font-sans font-bold rounded uppercase tracking-wider">
                  {cert.form_title}
                </div>
              </div>

              {/* Reference & Date Header */}
              <div className="flex justify-between items-start text-xs font-sans">
                <div>
                  <span className="font-semibold text-slate-600">Official Order No:</span>{' '}
                  <span className="font-mono font-bold text-slate-900">{cert.certificate_number}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-600">Date of Dispatch:</span>{' '}
                  <span className="font-bold text-slate-900">{cert.issue_date}</span>
                </div>
              </div>

              {/* Main Body Subject & Clauses */}
              <div className="space-y-4 text-xs font-sans leading-relaxed text-slate-700">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="font-bold text-slate-900 block mb-1">REGULATORY INSTRUMENT PARTICULARS:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div><span className="text-slate-500">Institution:</span> <span className="font-semibold block">{cert.institution_name}</span></div>
                    <div><span className="text-slate-500">AICTE Permanent ID:</span> <span className="font-semibold block">{cert.aicte_id}</span></div>
                    <div><span className="text-slate-500">FDR / Instrument No:</span> <span className="font-semibold font-mono block">{cert.fdr_number}</span></div>
                    <div><span className="text-slate-500">Issuing Bank & Branch:</span> <span className="font-semibold block">{cert.bank_name} ({cert.bank_branch})</span></div>
                    <div><span className="text-slate-500">Principal Deposit:</span> <span className="font-bold text-slate-900 block">₹{cert.deposit_amount.toLocaleString('en-IN')}</span></div>
                    <div><span className="text-slate-500">Maturity Date:</span> <span className="font-semibold block">{cert.maturity_date}</span></div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] italic text-slate-600">
                    Amount in Words: {cert.deposit_amount_words}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="font-bold text-slate-900 uppercase block">Statutory Decrees & Legal Conditions:</span>
                  <ul className="list-disc pl-5 space-y-1.5 text-slate-700">
                    {cert.legal_provisions.map((provision, idx) => (
                      <li key={idx}>{provision}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Signatures & QR Code Section */}
              <div className="pt-6 border-t-2 border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-6 font-sans">
                {/* QR Code Validation Box */}
                <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  {cert.qr_code_url && (
                    <img src={cert.qr_code_url} alt="QR Code" className="w-20 h-20 border border-slate-300 rounded" />
                  )}
                  <div className="text-[10px] space-y-0.5">
                    <span className="font-bold text-slate-900 block flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Tamper-Proof National Register Stamp
                    </span>
                    <span className="text-slate-500 block">Scan to verify authenticity against AICTE SAFE Portal</span>
                    <span className="font-mono text-[9px] text-slate-600 block truncate max-w-[200px]">
                      DSC: {cert.dsc_sign_hash.slice(0, 24)}...
                    </span>
                  </div>
                </div>

                {/* Authorized Signatory Block */}
                <div className="text-right text-xs">
                  <div className="inline-block px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded text-[10px] font-mono font-bold mb-1">
                    [DIGITALLY SIGNED VIA CLASS 3 DSC]
                  </div>
                  <p className="font-bold text-slate-900">{cert.signer_name}</p>
                  <p className="text-slate-600 text-[11px]">{cert.signer_designation}</p>
                  <p className="text-slate-500 text-[10px]">For & on behalf of All India Council for Technical Education</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-500">
                Official Order Reference: <span className="font-mono font-semibold">{cert.certificate_number}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Official Certificate</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

