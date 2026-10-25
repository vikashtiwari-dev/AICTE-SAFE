import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { ReleaseRequest } from '../types';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import {
  ArrowUpRightFromCircle,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  AlertCircle,
  Check,
  Eye,
  ShieldCheck,
  FileSignature,
  KeyRound,
  UserCheck,
  CheckCheck,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const Releases: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ReleaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  // Review modal state
  const [selectedReq, setSelectedReq] = useState<ReleaseRequest | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'Approved' | 'Rejected' | 'Under Review'>('Approved');
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // Multi-Tier Maker-Checker State
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [tierStage, setTierStage] = useState<'Finance_Officer' | 'Director_Approval'>('Finance_Officer');
  const [tierRemarks, setTierRemarks] = useState('');
  const [tierLoading, setTierLoading] = useState(false);

  // DSC Digital Signature State
  const [isDscModalOpen, setIsDscModalOpen] = useState(false);
  const [dscSignerName, setDscSignerName] = useState('Director, AICTE Regulation Bureau');
  const [dscPin, setDscPin] = useState('883921');
  const [dscSigning, setDscSigning] = useState(false);

  useEffect(() => {
    fetchReleases();
  }, [statusFilter]);

  const fetchReleases = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        ...(statusFilter && { status: statusFilter }),
      });
      const res = await api.get(`/releases?${params.toString()}`);
      setRequests(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq) return;
    setReviewLoading(true);
    try {
      await api.patch(`/releases/${selectedReq.id}/review`, {
        status: reviewStatus,
        remarks: reviewRemarks,
      });
      setIsReviewModalOpen(false);
      fetchReleases();
    } catch (err) {
      console.error(err);
    } finally {
      setReviewLoading(false);
    }
  };

  const handleTierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq) return;
    setTierLoading(true);
    try {
      await api.patch(`/releases/${selectedReq.id}/tier-review`, {
        stage: tierStage,
        remarks: tierRemarks,
      });
      setIsTierModalOpen(false);
      fetchReleases();
    } catch (err) {
      console.error(err);
    } finally {
      setTierLoading(false);
    }
  };

  const handleDscSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq) return;
    setDscSigning(true);
    try {
      await api.post(`/releases/${selectedReq.id}/dsc-sign`, {
        signer_name: dscSignerName,
        pin: dscPin,
      });
      setIsDscModalOpen(false);
      fetchReleases();
    } catch (err) {
      console.error(err);
    } finally {
      setDscSigning(false);
    }
  };

  const handleCompleteDischarge = async (requestId: number) => {
    if (!confirm('Confirm completion of release? This will mark the FDR as Released.')) return;
    try {
      await api.patch(`/releases/${requestId}/complete`, {
        remarks: 'Council Lien officially discharged; instrument released.',
      });
      fetchReleases();
    } catch (err) {
      console.error(err);
    }
  };

  const isBureauOrAdmin = user?.role === 'admin' || user?.role === 'bureau_officer';

  const formatCurrency = (amt?: number) => '₹' + (amt || 0).toLocaleString('en-IN');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Security Deposit Release & Refund Workflow</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Formal multi-stage authorization pipeline for lien discharges and refund processing
          </p>
        </div>

        {/* Workflow Lifecycle Summary Pill */}
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 bg-white p-2 rounded-lg border border-slate-200">
          <span className="text-amber-600">Pending</span> →
          <span className="text-blue-600">Under Review</span> →
          <span className="text-purple-600">Approved</span> →
          <span className="text-emerald-600 font-bold">Discharged</span>
        </div>
      </div>

      {/* Filter Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
        >
          <option value="">All Workflow Statuses</option>
          <option value="Pending">Pending Scrutiny</option>
          <option value="Under Review">Under Review</option>
          <option value="Approved">Approved by Competent Authority</option>
          <option value="Completed">Completed / Discharged</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      {/* Releases Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Request Ref / FDR</th>
                <th className="py-3 px-4">Technical Institution</th>
                <th className="py-3 px-4">Action Requested</th>
                <th className="py-3 px-4">Maker-Checker Approval Pipeline</th>
                <th className="py-3 px-4">Current Status & Legal DSC</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-2"></div>
                    <p>Loading workflow cases...</p>
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <AlertCircle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-600">No release/refund requests found.</p>
                  </td>
                </tr>
              ) : (
                requests.map((req) => {
                  const stage = req.review_stage || (req.status === 'Completed' ? 'Completed' : 'Dealing_Officer');
                  return (
                    <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4">
                        <Link to={`/fdrs/${req.fdr_id}`} className="font-bold text-blue-700 hover:text-blue-900">
                          {req.fdr_number}
                        </Link>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          Amount: {formatCurrency(req.deposit_amount)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-800">{req.institution_name}</p>
                        <span className="text-[10px] text-slate-400">{req.aicte_id}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-700">{req.request_type}</span>
                        <p className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5">{req.reason}</p>
                      </td>

                      {/* Multi-Tier Maker-Checker Pipeline Stepper */}
                      <td className="py-3.5 px-4 min-w-[260px]">
                        <div className="flex items-center gap-1.5 text-[10px]">
                          {/* Tier 1: Maker (College) */}
                          <div className="flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <Check className="w-3 h-3" />
                            <span>Maker</span>
                          </div>
                          <span className="text-slate-300">→</span>

                          {/* Tier 2: Dealing Assistant */}
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded border font-semibold ${
                            stage === 'Finance_Officer' || stage === 'Director_Approval' || stage === 'Completed'
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                              : stage === 'Dealing_Officer'
                              ? 'text-blue-700 bg-blue-50 border-blue-200 animate-pulse'
                              : 'text-slate-400 bg-slate-50 border-slate-200'
                          }`}>
                            {stage === 'Finance_Officer' || stage === 'Director_Approval' || stage === 'Completed' ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Clock className="w-3 h-3" />
                            )}
                            <span>Dealing Asst</span>
                          </div>
                          <span className="text-slate-300">→</span>

                          {/* Tier 3: Finance Officer */}
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded border font-semibold ${
                            stage === 'Director_Approval' || stage === 'Completed'
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                              : stage === 'Finance_Officer'
                              ? 'text-amber-700 bg-amber-50 border-amber-200 animate-pulse'
                              : 'text-slate-400 bg-slate-50 border-slate-200'
                          }`}>
                            {stage === 'Director_Approval' || stage === 'Completed' ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Clock className="w-3 h-3" />
                            )}
                            <span>Finance Off</span>
                          </div>
                          <span className="text-slate-300">→</span>

                          {/* Tier 4: Director DSC */}
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded border font-semibold ${
                            stage === 'Completed' || req.dsc_sign_hash
                              ? 'text-purple-700 bg-purple-50 border-purple-200'
                              : stage === 'Director_Approval'
                              ? 'text-rose-700 bg-rose-50 border-rose-200 font-bold animate-pulse'
                              : 'text-slate-400 bg-slate-50 border-slate-200'
                          }`}>
                            <FileSignature className="w-3 h-3" />
                            <span>Director DSC</span>
                          </div>
                        </div>

                        {req.dealing_officer_remarks && (
                          <p className="text-[10px] text-slate-500 mt-1 italic">
                            Dealing: "{req.dealing_officer_remarks}"
                          </p>
                        )}
                        {req.finance_officer_remarks && (
                          <p className="text-[10px] text-slate-500 italic">
                            Finance: "{req.finance_officer_remarks}"
                          </p>
                        )}
                      </td>

                      {/* Status & DSC Stamp */}
                      <td className="py-3.5 px-4">
                        <Badge status={req.status} />
                        {req.dsc_sign_hash ? (
                          <div className="mt-1.5 flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 w-fit">
                              <ShieldCheck className="w-3 h-3 text-purple-600" />
                              {req.dsc_sign_hash}
                            </span>
                            <span className="text-[9px] text-slate-400">
                              Digitally signed by {req.dsc_signer_name || 'Director'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Stage: {stage.replace('_', ' ')}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to={`/fdrs/${req.fdr_id}`}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded"
                            title="View Instrument"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>

                          {isBureauOrAdmin && req.status !== 'Completed' && req.status !== 'Rejected' && (
                            <>
                              {/* Advance to next tier button */}
                              {stage === 'Dealing_Officer' && (
                                <button
                                  onClick={() => {
                                    setSelectedReq(req);
                                    setTierStage('Finance_Officer');
                                    setTierRemarks('Documents scrutinized per APH norms; forwarded to Finance Officer.');
                                    setIsTierModalOpen(true);
                                  }}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold transition-colors"
                                >
                                  Scrutiny Clear →
                                </button>
                              )}

                              {stage === 'Finance_Officer' && (
                                <button
                                  onClick={() => {
                                    setSelectedReq(req);
                                    setTierStage('Director_Approval');
                                    setTierRemarks('Bank clearance verified; lien balance reconciled.');
                                    setIsTierModalOpen(true);
                                  }}
                                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-semibold transition-colors"
                                >
                                  Finance Clear →
                                </button>
                              )}

                              {stage === 'Director_Approval' && (
                                <button
                                  onClick={() => {
                                    setSelectedReq(req);
                                    setIsDscModalOpen(true);
                                  }}
                                  className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white rounded text-[11px] font-semibold flex items-center gap-1 shadow-sm transition-colors"
                                >
                                  <FileSignature className="w-3.5 h-3.5" />
                                  <span>Sign with DSC</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Tier Progression Modal */}
      <Modal
        isOpen={isTierModalOpen}
        onClose={() => setIsTierModalOpen(false)}
        title="Multi-Tier Maker-Checker Forwarding"
      >
        <form onSubmit={handleTierSubmit} className="space-y-4">
          <p className="text-xs text-slate-500">
            Forwarding Release Request for instrument <span className="font-semibold text-slate-800">{selectedReq?.fdr_number}</span> to the next administrative tier.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Target Review Tier</label>
            <input
              type="text"
              readOnly
              value={tierStage === 'Finance_Officer' ? 'Tier 2: AICTE Finance Officer Audit' : 'Tier 3: Director Competent Authority Approval'}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 text-slate-700 font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Scrutiny Observations & Recommendations <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={tierRemarks}
              onChange={(e) => setTierRemarks(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsTierModalOpen(false)}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={tierLoading}
              className="px-4 py-1.5 bg-blue-600 text-white font-semibold text-xs rounded-lg hover:bg-blue-700 transition-colors"
            >
              {tierLoading ? 'Forwarding...' : 'Approve & Forward to Next Tier'}
            </button>
          </div>
        </form>
      </Modal>

      {/* DSC Digital Signature Modal */}
      <Modal
        isOpen={isDscModalOpen}
        onClose={() => setIsDscModalOpen(false)}
        title="Digital Signature Certificate (DSC) / e-Sign Authorization"
      >
        <form onSubmit={handleDscSubmit} className="space-y-4">
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-1 text-xs text-purple-900">
            <div className="flex items-center gap-1.5 font-bold">
              <KeyRound className="w-4 h-4 text-purple-700" />
              <span>GIGW / IT Act 2000 Section 3A Digital Sealing</span>
            </div>
            <p className="text-[11px] text-purple-700">
              Applying a cryptographic digital signature provides non-repudiation and legal finality for the release of FDR #{selectedReq?.fdr_number} (Amount: {formatCurrency(selectedReq?.deposit_amount)}).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Signatory Authority Name</label>
            <input
              type="text"
              required
              value={dscSignerName}
              onChange={(e) => setDscSignerName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Hardware Token PIN / e-Sign OTP</label>
            <input
              type="password"
              required
              value={dscPin}
              onChange={(e) => setDscPin(e.target.value)}
              placeholder="Enter 6-digit cryptographic token PIN"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono tracking-widest"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsDscModalOpen(false)}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={dscSigning}
              className="px-4 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5"
            >
              <FileSignature className="w-3.5 h-3.5" />
              <span>{dscSigning ? 'Sealing Cryptographic Certificate...' : 'Execute DSC Seal & Discharge'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Scrutiny & Approval Modal */}
      <Modal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        title="Bureau Scrutiny & Competent Authority Approval"
      >
        <form onSubmit={handleReviewSubmit} className="space-y-4">
          <p className="text-xs text-slate-500">
            FDR: <span className="font-semibold text-slate-700">{selectedReq?.fdr_number}</span> ({selectedReq?.institution_name})
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Approval Decision</label>
            <select
              value={reviewStatus}
              onChange={(e) => setReviewStatus(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white"
            >
              <option value="Under Review">Under Review (Scrutinizing Compliance)</option>
              <option value="Approved">Approved by Competent Authority</option>
              <option value="Rejected">Rejected (Non-compliant with Regulations)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Bureau Observations / Remarks</label>
            <textarea
              rows={3}
              value={reviewRemarks}
              onChange={(e) => setReviewRemarks(e.target.value)}
              placeholder="e.g. Verified mandatory 10-year lock-in satisfied, no complaints pending, approved per APH Chapter 1..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsReviewModalOpen(false)}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={reviewLoading}
              className="px-4 py-1.5 bg-blue-600 text-white font-semibold text-xs rounded-lg hover:bg-blue-700 transition-colors"
            >
              {reviewLoading ? 'Recording...' : 'Save Decision'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
