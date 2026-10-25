import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { AuditLogEntry, FDR, MacroAnalytics } from '../types';
import { Badge } from '../components/ui/Badge';
import {
  FileBarChart,
  Calendar,
  Building2,
  History,
  Download,
  AlertTriangle,
  FileCheck2,
  TrendingUp,
  Landmark,
  PieChart as PieIcon,
  ShieldAlert,
  IndianRupee,
  Activity,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

export const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'institution' | 'maturity' | 'audit' | 'predictive'>('predictive');
  const [instWise, setInstWise] = useState<any[]>([]);
  const [expiringFDRs, setExpiringFDRs] = useState<FDR[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [macroData, setMacroData] = useState<MacroAnalytics | null>(null);
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
      } else if (activeTab === 'predictive') {
        const res = await api.get('/reports/macro-analytics');
        setMacroData(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amt?: number) => '₹' + (amt || 0).toLocaleString('en-IN');
  const COLORS = ['#1d4ed8', '#059669', '#d97706', '#9333ea', '#0284c7', '#e11d48', '#475569'];

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
      <div className="flex gap-2 border-b border-slate-200 pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('predictive')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
            activeTab === 'predictive'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Predictive Cash Flow & Bank Distribution</span>
        </button>

        <button
          onClick={() => setActiveTab('institution')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
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
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
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
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
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
        ) : activeTab === 'predictive' ? (
          <div className="p-6 space-y-8">
            {/* Macro KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="bg-slate-900 text-white p-5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-semibold uppercase">Total Locked-in Capital</span>
                  <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg">
                    <IndianRupee className="w-5 h-5" />
                  </div>
                </div>
                <p className="text-2xl font-bold mt-2 text-white">
                  {formatCurrency(macroData?.totalLockedCapital || 0)}
                </p>
                <p className="text-xs text-slate-400 mt-1">Across all AICTE-approved technical institutions</p>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-semibold uppercase">Active Security Instruments</span>
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                    <FileCheck2 className="w-5 h-5" />
                  </div>
                </div>
                <p className="text-2xl font-bold mt-2 text-slate-800">
                  {macroData?.activeInstruments || 0} Instruments
                </p>
                <p className="text-xs text-slate-400 mt-1">Currently under active Council legal lien</p>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-semibold uppercase">Concentration Risk Rating</span>
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                    <Landmark className="w-5 h-5" />
                  </div>
                </div>
                <p className="text-2xl font-bold mt-2 text-indigo-700">Moderate Diversification</p>
                <p className="text-xs text-slate-400 mt-1">Spread across Public & Private Scheduled Banks</p>
              </div>
            </div>

            {/* Bank Concentration Breakdown & Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Distribution Bar Chart */}
              <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-200">
                <h3 className="text-sm font-bold text-slate-800 mb-1">
                  Scheduled Bank Capital Distribution
                </h3>
                <p className="text-xs text-slate-400 mb-6">Total security deposit volume by banking institution</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={macroData?.bankDistribution || []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="bank_name" tick={{ fontSize: 10 }} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`}
                      />
                      <Tooltip
                        formatter={(val: any) => [formatCurrency(val), 'Capital']}
                        contentStyle={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: '8px', fontSize: '11px' }}
                      />
                      <Bar dataKey="total_amount" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Bank Concentration Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800">Bank Concentration Registry</h3>
                  <p className="text-xs text-slate-400">Share of total national FDR guarantee pool</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-2.5 px-3">Bank Name</th>
                        <th className="py-2.5 px-3 text-center">Instruments</th>
                        <th className="py-2.5 px-3 text-right">Total Deposit Capital</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {macroData?.bankDistribution?.map((b, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-800 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                            <span>{b.bank_name}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-600 font-medium">{b.count}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatCurrency(b.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Quarterly Release Forecast (Q1 to Q4) */}
            <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-200">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Projected Release & Refund Volumes (Next Fiscal Quarter Cycle)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Forecast of maturing FDRs eligible for lien discharge and liquidity impact
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  FY 2026-27 Projection
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {macroData?.quarterlyForecast?.map((q, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">{q.quarter}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        q.risk_level === 'Low' ? 'bg-emerald-50 text-emerald-700' :
                        q.risk_level === 'Medium' ? 'bg-amber-50 text-amber-700' :
                        'bg-rose-50 text-rose-700'
                      }`}>
                        {q.risk_level} Vol
                      </span>
                    </div>
                    <p className="text-xl font-bold text-slate-900 mt-2">{formatCurrency(q.projected_amount)}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {q.projected_releases} projected releases scheduled
                    </p>
                  </div>
                ))}
              </div>
            </div>
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
