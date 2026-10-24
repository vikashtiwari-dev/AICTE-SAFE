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
                <th className="py-3 px-4">Justification & Regulatory Reason</th>
                <th className="py-3 px-4">Current Workflow Stage</th>
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
                requests.map((req) => (
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
                    <td className="py-3.5 px-4 font-semibold text-slate-700">
                      {req.request_type}
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="line-clamp-2 text-slate-700">{req.reason}</p>
                      {req.remarks && (
                        <p className="text-[10px] text-blue-600 mt-0.5 font-medium">Remarks: {req.remarks}</p>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge status={req.status} />
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {req.status === 'Completed'
                          ? `Discharged`
                          : req.approved_by_name
                          ? `Approved by ${req.approved_by_name}`
                          : req.requested_at}
                      </span>
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
                            <button
                              onClick={() => {
                                setSelectedReq(req);
                                setReviewStatus(req.status === 'Pending' ? 'Under Review' : 'Approved');
                                setReviewRemarks(req.remarks || '');
                                setIsReviewModalOpen(true);
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded text-[11px] font-semibold"
                            >
                              Review
                            </button>

                            {req.status === 'Approved' && (
                              <button
                                onClick={() => handleCompleteDischarge(req.id)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold"
                              >
                                Execute Discharge
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
