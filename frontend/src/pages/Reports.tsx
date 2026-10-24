import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { AuditLogEntry, FDR } from '../types';
import { Badge } from '../components/ui/Badge';
import {
  FileBarChart,
  Calendar,
  Building2,
  History,
  Download,
  AlertTriangle,
  FileCheck2,
} from 'lucide-react';

export const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'institution' | 'maturity' | 'audit'>('institution');
  const [instWise, setInstWise] = useState<any[]>([]);
  const [expiringFDRs, setExpiringFDRs] = useState<FDR[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    try {
      setLoading(true);
      if (activeTab === 'institution') {
        const res = await api.get('/reports/institution-wise');
        setInstWise(res.data);
      } else if (activeTab === 'maturity') {
        const res = await api.get('/reports/expiring');
        setExpiringFDRs(res.data);
      } else if (activeTab === 'audit') {
        const res = await api.get('/reports/audit-log?limit=100');
        setAuditLogs(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amt?: number) => '₹' + (amt || 0).toLocaleString('en-IN');

  const printReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Regulatory Analytics & Audit Reports</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Institutional liability audits, maturity timelines, and complete traceable activity logs
          </p>
        </div>

        <button
          onClick={printReport}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 shadow-sm"
        >
          <Download className="w-4 h-4 text-slate-500" />
          <span>Print / Export Report</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveTab('institution')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'institution'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Institution-Wise Portfolio</span>
        </button>

        <button
          onClick={() => setActiveTab('maturity')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'maturity'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Upcoming Maturities (90 Days)</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'audit'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <History className="w-4 h-4" />
          <span>System Audit Trail Log</span>
        </button>
      </div>

      {/* Content Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-2"></div>
            <p className="text-xs">Generating analytical ledger...</p>
          </div>
        ) : activeTab === 'institution' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">AICTE ID</th>
                  <th className="py-3 px-4">Technical Institution</th>
                  <th className="py-3 px-4">State / Type</th>
                  <th className="py-3 px-4">Active Instruments</th>
                  <th className="py-3 px-4">Total Collateral Value</th>
                  <th className="py-3 px-4">Action Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {instWise.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4 font-bold text-blue-700">{i.aicte_id}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800">{i.name}</td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {i.state || 'N/A'} • {i.institution_type}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-800">{i.active_count || 0}</span> active / {i.total_fdrs} total
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">{formatCurrency(i.total_deposit_amount)}</td>
                    <td className="py-3.5 px-4">
                      {i.expiring_count > 0 || i.discrepancy_count > 0 ? (
                        <div className="flex gap-1.5 flex-wrap">
                          {i.expiring_count > 0 && (
                            <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200">
                              {i.expiring_count} Expiring
                            </span>
                          )}
                          {i.discrepancy_count > 0 && (
                            <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-200">
                              {i.discrepancy_count} Discrepancy
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-emerald-700 text-[11px] font-medium">✓ Compliant</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'maturity' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">FDR Number</th>
                  <th className="py-3 px-4">Institution</th>
                  <th className="py-3 px-4">Bank</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Maturity Date</th>
                  <th className="py-3 px-4">Validity Horizon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expiringFDRs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No instruments maturing in the next 90 days.
                    </td>
                  </tr>
                ) : (
                  expiringFDRs.map((fdr) => (
                    <tr key={fdr.id} className="hover:bg-slate-50">
                      <td className="py-3.5 px-4 font-bold text-blue-700">{fdr.fdr_number}</td>
                      <td className="py-3.5 px-4 text-slate-800 font-semibold">{fdr.institution_name}</td>
                      <td className="py-3.5 px-4 text-slate-600">{fdr.bank_name}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">{formatCurrency(fdr.deposit_amount)}</td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">{fdr.maturity_date}</td>
                      <td className="py-3.5 px-4">
                        <span className="bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded text-[11px] border border-amber-200">
                          {fdr.days_to_maturity} days remaining
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Scope</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Executed By</th>
                  <th className="py-3 px-4">Trace Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{log.changed_at}</td>
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {log.entity_type} #{log.entity_id}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="font-medium">{log.changed_by_name || 'System Engine'}</span>
                      {log.changed_by_role && (
                        <span className="text-[10px] text-slate-400 block">{log.changed_by_role}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-sm truncate">{log.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
