import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { DashboardSummary, FDR, Alert, ComplianceHealth, MacroAnalytics } from '../types';
import { StatCard } from '../components/ui/StatCard';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../context/LanguageContext';
import {
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  AlertTriangle,
  IndianRupee,
  ArrowUpRightFromCircle,
  TrendingUp,
  FileCheck2,
  Building,
  ShieldCheck,
  Award,
  Zap,
  Activity,
  ChevronRight,
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

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [typeData, setTypeData] = useState<any[]>([]);
  const [expiringFDRs, setExpiringFDRs] = useState<FDR[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [healthData, setHealthData] = useState<ComplianceHealth | null>(null);
  const [macroData, setMacroData] = useState<MacroAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [sumRes, breakdownRes, expRes, alertRes, healthRes, macroRes] = await Promise.all([
        api.get('/reports/summary'),
        api.get('/reports/status-breakdown'),
        api.get('/reports/expiring'),
        api.get('/alerts?is_resolved=0'),
        api.get('/reports/compliance-health/current').catch(() => ({ data: null })),
        api.get('/reports/macro-analytics').catch(() => ({ data: null })),
      ]);

      setSummary(sumRes.data);
      setStatusData(breakdownRes.data.statusBreakdown || []);
      setTypeData(breakdownRes.data.typeBreakdown || []);
      setExpiringFDRs(expRes.data.slice(0, 5));
      setRecentAlerts(alertRes.data.slice(0, 5));
      if (healthRes.data) setHealthData(healthRes.data);
      if (macroRes.data) setMacroData(macroRes.data);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['#1d4ed8', '#059669', '#d97706', '#9333ea', '#64748b', '#e11d48'];

  const formatCurrency = (amount: number) => {
    return '₹' + amount.toLocaleString('en-IN');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Institution Self-Service Financial Health Score Widget */}
      {healthData && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white rounded-2xl p-6 shadow-xl border border-slate-700">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  AICTE APH Compliance Framework
                </span>
                <span className="text-xs text-slate-400">
                  Evaluated: {new Date(healthData.evaluated_at).toLocaleDateString('en-IN')}
                </span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                Institution Financial Health Score: {healthData.institution_name}
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Automated continuous scoring based on FDR validity, active Council lien markings, dispute resolution velocity, and timely renewals pursuant to Approval Process Handbook (APH) regulations.
              </p>
            </div>

            {/* Score & APH Indicators */}
            <div className="flex flex-wrap items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/10 shrink-0">
              <div className="text-center px-3 border-r border-white/10">
                <p className="text-[10px] uppercase font-semibold text-slate-400">Compliance Score</p>
                <div className="flex items-baseline justify-center gap-1 mt-0.5">
                  <span className={`text-3xl font-black ${
                    healthData.health_score >= 80 ? 'text-emerald-400' :
                    healthData.health_score >= 50 ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {healthData.health_score}
                  </span>
                  <span className="text-xs text-slate-400">/100</span>
                </div>
                <span className="text-[10px] font-bold text-slate-300">{healthData.grade}</span>
              </div>

              <div className="text-center px-3 border-r border-white/10">
                <p className="text-[10px] uppercase font-semibold text-slate-400">Statutory Penalty</p>
                <p className={`text-xl font-bold mt-1 ${healthData.statutory_penalty_amount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {formatCurrency(healthData.statutory_penalty_amount)}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {healthData.statutory_penalty_amount > 0 ? 'Overdue Surcharge' : 'Zero Liability'}
                </p>
              </div>

              <div className="text-left px-2">
                <p className="text-[10px] uppercase font-semibold text-slate-400">Handbook Status</p>
                <span className={`inline-block mt-1 px-2.5 py-1 rounded text-xs font-semibold ${
                  healthData.health_score >= 80 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                  healthData.health_score >= 50 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                  'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  {healthData.aph_status}
                </span>
                <p className="text-[10px] text-slate-400 mt-1">Intake quota approval clear</p>
              </div>
            </div>
          </div>

          {/* Action Items if any */}
          {healthData.action_items && healthData.action_items.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-amber-300">
                <Zap className="w-4 h-4 shrink-0" />
                <span className="font-semibold">Statutory Advisory:</span>
                <span className="text-slate-200">{healthData.action_items[0]}</span>
              </div>
              <Link
                to="/fdrs"
                className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                <span>Upload Renewal Instruments</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Macro Analytics Summary Banner */}
      {macroData && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-700 rounded-lg">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs uppercase font-semibold text-slate-500">National Macro Security Deposit Liquidity</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xl font-bold text-slate-800">{formatCurrency(macroData.totalLockedCapital)}</span>
                <span className="text-xs text-slate-500 font-medium">({macroData.activeInstruments} active instruments locked in AICTE lien)</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-[11px] text-slate-400">Quarterly Outflow Forecast</p>
              <p className="text-xs font-bold text-slate-700">Q1-Q4 Scheduled Release Cycle Active</p>
            </div>
            <Link
              to="/reports"
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <span>View Cash Flow Analytics</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Total Security Deposits"
          value={formatCurrency(summary?.total_amount || 0)}
          subtitle={`${summary?.total_fdrs || 0} Total Instruments`}
          icon={IndianRupee}
          color="blue"
        />
        <StatCard
          title="Active Instruments"
          value={summary?.active_count || 0}
          subtitle="Currently valid & compliant"
          icon={CheckCircle2}
          color="emerald"
        />
        <StatCard
          title="Expiring / Action Due"
          value={summary?.expiring_soon_count || 0}
          subtitle="Maturing within next 30 days"
          icon={Clock}
          color="amber"
        />
        <StatCard
          title="Pending Scrutiny"
          value={summary?.pending_verification_count || 0}
          subtitle={`${summary?.discrepancy_count || 0} flagged with discrepancies`}
          icon={AlertTriangle}
          color="rose"
        />
      </div>

      {/* Second row Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-slate-500 font-semibold">Matured Deposits</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{summary?.matured_count || 0}</p>
            <p className="text-xs text-slate-400 mt-0.5">Awaiting renewal or refund</p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-700 rounded-lg">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-slate-500 font-semibold">Pending Releases</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{summary?.pending_releases_count || 0}</p>
            <p className="text-xs text-slate-400 mt-0.5">Requests under approval</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-700 rounded-lg">
            <ArrowUpRightFromCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-slate-500 font-semibold">Active Alerts</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{summary?.unresolved_alerts_count || 0}</p>
            <p className="text-xs text-slate-400 mt-0.5">Requiring Bureau attention</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-700 rounded-lg">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Status Breakdown Bar Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-base font-bold text-slate-800 mb-1">Instrument Status Distribution</h3>
          <p className="text-xs text-slate-400 mb-6">Volume of FDRs across operational regulatory statuses</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: any) => [`${value} instruments`, 'Count']}
                  contentStyle={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="count" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Deposit Type Pie Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-base font-bold text-slate-800 mb-1">Financial Guarantee Classification</h3>
          <p className="text-xs text-slate-400 mb-6">Distribution by legal instrument form</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={5}
                  dataKey="count"
                  nameKey="deposit_type"
                >
                  {typeData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any, name: any) => [`${value} instruments`, name]}
                  contentStyle={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: '8px', fontSize: '12px' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tables Row: Expiring Soon + Recent Critical Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Approaching Maturity */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-800">Approaching Maturity (Next 90 Days)</h3>
              <p className="text-xs text-slate-400">Time-sensitive FDRs requiring renewal monitoring</p>
            </div>
            <Link to="/fdrs" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
              View All →
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {expiringFDRs.length === 0 ? (
              <p className="p-6 text-xs text-slate-400 text-center">No FDRs maturing in the next 90 days.</p>
            ) : (
              expiringFDRs.map((fdr) => (
                <div key={fdr.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <Link to={`/fdrs/${fdr.id}`} className="font-semibold text-sm text-slate-800 hover:text-blue-600 truncate">
                        {fdr.fdr_number}
                      </Link>
                      <Badge status={fdr.status} />
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{fdr.institution_name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Bank: {fdr.bank_name} • Maturity: <span className="font-semibold text-slate-600">{fdr.maturity_date}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-800">{formatCurrency(fdr.deposit_amount)}</p>
                    <span className="inline-block mt-1 text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                      {fdr.days_to_maturity} days left
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Priority Regulatory Alerts */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-800">Active Regulatory Alerts</h3>
              <p className="text-xs text-slate-400">Unresolved discrepancies and expiry warnings</p>
            </div>
            <Link to="/alerts" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
              View All Alerts →
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentAlerts.length === 0 ? (
              <p className="p-6 text-xs text-slate-400 text-center">No active alerts requiring intervention.</p>
            ) : (
              recentAlerts.map((alert) => (
                <div key={alert.id} className="p-4 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                  <div className="mt-0.5">
                    <Badge status={alert.severity} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800 leading-snug">{alert.message}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                      <span>{alert.institution_name}</span>
                      <span>•</span>
                      <span>Type: {alert.alert_type}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
