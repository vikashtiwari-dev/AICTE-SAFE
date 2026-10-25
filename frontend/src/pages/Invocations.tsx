import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { LienInvocation, FDR } from '../types';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../hooks/useAuth';
import {
  Gavel,
  AlertTriangle,
  FileText,
  Building2,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldAlert,
  Send,
  XCircle,
  Landmark,
  FileCheck,
} from 'lucide-react';

export const Invocations: React.FC = () => {
  const { user } = useAuth();
  const [invocations, setInvocations] = useState<LienInvocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Action Modals State
  const [selectedInv, setSelectedInv] = useState<LienInvocation | null>(null);
  const [actionType, setActionType] = useState<'show_cause' | 'bank_demand' | 'confirm_recovery' | 'drop' | null>(null);
  const [actionRemarks, setActionRemarks] = useState('');
  const [recoveryUtr, setRecoveryUtr] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // New Invocation Modal State
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [allFdrs, setAllFdrs] = useState<FDR[]>([]);
  const [selectedFdrId, setSelectedFdrId] = useState('');
  const [reasonCode, setReasonCode] = useState('REGULATORY_NON_COMPLIANCE');
  const [justification, setJustification] = useState('');
  const [demandAmount, setDemandAmount] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchInvocations();
  }, [statusFilter]);

  const fetchInvocations = async () => {
    try {
      setLoading(true);
      const url = statusFilter ? `/invocations?status=${statusFilter}` : '/invocations';
      const res = await api.get(url);
      setInvocations(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openNewModal = async () => {
    try {
      const res = await api.get('/fdrs?status=Active&limit=100');
      setAllFdrs(res.data.data || []);
      setIsNewModalOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateInvocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFdrId || !justification.trim()) return;

    setCreating(true);
    try {
      await api.post('/invocations', {
        fdr_id: parseInt(selectedFdrId),
        reason_code: reasonCode,
        justification: justification.trim(),
        demand_amount: demandAmount ? parseFloat(demandAmount) : undefined
      });
      setIsNewModalOpen(false);
      setSelectedFdrId('');
      setJustification('');
      setDemandAmount('');
      fetchInvocations();
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleExecuteAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInv || !actionType) return;

    setSubmittingAction(true);
    try {
      if (actionType === 'show_cause') {
        await api.post(`/invocations/${selectedInv.id}/show-cause`, { remarks: actionRemarks });
      } else if (actionType === 'bank_demand') {
        await api.post(`/invocations/${selectedInv.id}/serve-demand`, { remarks: actionRemarks });
      } else if (actionType === 'confirm_recovery') {
        await api.patch(`/invocations/${selectedInv.id}/confirm-recovery`, {
          recovery_utr_challan: recoveryUtr,
          remarks: actionRemarks
        });
      } else if (actionType === 'drop') {
        await api.patch(`/invocations/${selectedInv.id}/drop`, { remarks: actionRemarks });
      }
      setActionType(null);
      setSelectedInv(null);
      setActionRemarks('');
      setRecoveryUtr('');
      fetchInvocations();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingAction(false);
    }
  };

  const isBureauOrAdmin = user?.role === 'admin' || user?.role === 'bureau_officer';

  // Metrics
  const totalInvocations = invocations.length;
  const totalValue = invocations.reduce((acc, curr) => acc + (curr.demand_amount || 0), 0);
  const encashedCount = invocations.filter(i => i.status === 'Funds_Encashment_Confirmed').length;
  const activeCount = invocations.filter(i => i.status !== 'Funds_Encashment_Confirmed' && i.status !== 'Dropped').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Gavel className="w-5 h-5 text-rose-600" />
            Lien Invocation & Deposit Forfeiture Bureau
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Statutory encashment proceedings, Show-Cause issuance, and penalty recovery under Section 10 of AICTE Act, 1987
          </p>
        </div>

        {isBureauOrAdmin && (
          <button
            onClick={openNewModal}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>+ Initiate Lien Invocation</span>
          </button>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-400 block font-medium">Total Cases</span>
          <span className="text-2xl font-bold text-slate-900 mt-1 block">{totalInvocations}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-400 block font-medium">Active Proceedings</span>
          <span className="text-2xl font-bold text-amber-600 mt-1 block">{activeCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-400 block font-medium">Funds Encashment Confirmed</span>
          <span className="text-2xl font-bold text-emerald-600 mt-1 block">{encashedCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-400 block font-medium">Total Value Under Recovery</span>
          <span className="text-2xl font-bold text-slate-900 mt-1 block">₹{totalValue.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {['', 'Initiated', 'ShowCause_Served', 'BankDemand_Issued', 'Funds_Encashment_Confirmed', 'Dropped'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
              statusFilter === s ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s ? s.replace(/_/g, ' ') : 'All Invocation Proceedings'}
          </button>
        ))}
      </div>

      {/* Table List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : invocations.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2 opacity-80" />
            <p className="text-sm font-semibold text-slate-700">No Lien Invocations Active</p>
            <p className="text-xs text-slate-400 mt-0.5">All technical institutions maintain compliant security deposits.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Case Reference</th>
                  <th className="py-3 px-4">Institution & Instrument</th>
                  <th className="py-3 px-4">Grounds / Reason</th>
                  <th className="py-3 px-4">Demand Amount</th>
                  <th className="py-3 px-4">Status & Timeline</th>
                  <th className="py-3 px-4 text-right">Regulatory Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invocations.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {inv.invocation_ref}
                      <span className="block text-[10px] font-sans text-slate-400 font-normal">
                        Initiated {inv.initiated_at.split(' ')[0]}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-800 block">{inv.institution_name}</span>
                      <span className="text-[11px] text-slate-500 block">
                        {inv.aicte_id} • {inv.fdr_number} ({inv.bank_name})
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded text-[10px] block w-fit">
                        {inv.reason_code.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[11px] text-slate-600 line-clamp-1 mt-0.5 max-w-xs">
                        {inv.justification}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      ₹{inv.demand_amount.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        inv.status === 'Funds_Encashment_Confirmed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : inv.status === 'Dropped'
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {inv.status.replace(/_/g, ' ')}
                      </span>
                      {inv.show_cause_deadline && inv.status === 'ShowCause_Served' && (
                        <span className="block text-[10px] text-amber-700 font-semibold mt-0.5">
                          Cure Deadline: {inv.show_cause_deadline}
                        </span>
                      )}
                      {inv.recovery_utr_challan && (
                        <span className="block text-[10px] text-slate-500 font-mono mt-0.5">
                          UTR: {inv.recovery_utr_challan}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      {isBureauOrAdmin && inv.status === 'Initiated' && (
                        <button
                          onClick={() => { setSelectedInv(inv); setActionType('show_cause'); }}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded font-semibold text-[11px]"
                        >
                          Issue Show-Cause
                        </button>
                      )}
                      {isBureauOrAdmin && inv.status === 'ShowCause_Served' && (
                        <button
                          onClick={() => { setSelectedInv(inv); setActionType('bank_demand'); }}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-semibold text-[11px]"
                        >
                          Serve Bank Demand
                        </button>
                      )}
                      {isBureauOrAdmin && inv.status === 'BankDemand_Issued' && (
                        <button
                          onClick={() => { setSelectedInv(inv); setActionType('confirm_recovery'); }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold text-[11px]"
                        >
                          Confirm Encashment
                        </button>
                      )}
                      {user?.role === 'admin' && inv.status !== 'Funds_Encashment_Confirmed' && inv.status !== 'Dropped' && (
                        <button
                          onClick={() => { setSelectedInv(inv); setActionType('drop'); }}
                          className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-semibold text-[11px]"
                        >
                          Drop
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action Execution Modal */}
      {actionType && selectedInv && (
        <Modal
          isOpen={true}
          onClose={() => { setActionType(null); setSelectedInv(null); }}
          title={`Execute Regulatory Action: ${actionType.replace(/_/g, ' ').toUpperCase()}`}
          maxWidth="max-w-lg"
        >
          <form onSubmit={handleExecuteAction} className="space-y-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
              <div><span className="text-slate-500">Institution:</span> <strong>{selectedInv.institution_name}</strong></div>
              <div><span className="text-slate-500">Instrument:</span> <span className="font-mono">{selectedInv.fdr_number}</span> ({selectedInv.bank_name})</div>
              <div><span className="text-slate-500">Demand:</span> <strong>₹{selectedInv.demand_amount.toLocaleString('en-IN')}</strong></div>
            </div>

            {actionType === 'confirm_recovery' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bank Remittance UTR / Challan Reference *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. UTR-SBI-2026-9918274"
                  value={recoveryUtr}
                  onChange={(e) => setRecoveryUtr(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono bg-white outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Official Regulatory Remarks / Justification
              </label>
              <textarea
                rows={3}
                required
                placeholder="Enter formal reasons and citations..."
                value={actionRemarks}
                onChange={(e) => setActionRemarks(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => { setActionType(null); setSelectedInv(null); }}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingAction}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold"
              >
                {submittingAction ? 'Processing...' : 'Confirm Regulatory Order'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* New Invocation Initiation Modal */}
      {isNewModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsNewModalOpen(false)}
          title="Initiate Formal Statutory Lien Invocation Proceeding"
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleCreateInvocation} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Select Target Financial Instrument *</label>
              <select
                required
                value={selectedFdrId}
                onChange={(e) => {
                  setSelectedFdrId(e.target.value);
                  const f = allFdrs.find(x => x.id === parseInt(e.target.value));
                  if (f) setDemandAmount(f.deposit_amount.toString());
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white outline-none"
              >
                <option value="">-- Choose Institution FDR --</option>
                {allFdrs.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.fdr_number} • {f.institution_name} (₹{f.deposit_amount.toLocaleString('en-IN')})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Statutory Grounds for Invocation *</label>
              <select
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white outline-none"
              >
                <option value="REGULATORY_NON_COMPLIANCE">Gross Non-Compliance with APH Norms</option>
                <option value="UNAUTHORIZED_CLOSURE">Unauthorized Closure / Student Abandonment</option>
                <option value="FRAUDULENT_ADMISSION">Fraudulent Excess Admission Beyond Sanctioned Intake</option>
                <option value="COURT_DIRECTIVE">Directive Issued by High Court / Supreme Court</option>
                <option value="DEFICIENT_INFRASTRUCTURE">Critical Infrastructure & Faculty Deficiencies</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Demand Encashment Amount (INR) *</label>
              <input
                type="number"
                required
                value={demandAmount}
                onChange={(e) => setDemandAmount(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Detailed Council Justification & Case Notes *</label>
              <textarea
                required
                rows={3}
                placeholder="Provide detailed factual findings and Approval Bureau file references..."
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold"
              >
                {creating ? 'Initiating...' : 'Initiate Statutory Proceeding'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

