import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { DashboardSummary, FDR, Alert } from '../types';
import { StatCard } from '../components/ui/StatCard';
import { Badge } from '../components/ui/Badge';
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
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [typeData, setTypeData] = useState<any[]>([]);
  const [expiringFDRs, setExpiringFDRs] = useState<FDR[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [sumRes, breakdownRes, expRes, alertRes] = await Promise.all([
        api.get('/reports/summary'),
        api.get('/reports/status-breakdown'),
        api.get('/reports/expiring'),
        api.get('/alerts?is_resolved=0'),
      ]);

      setSummary(sumRes.data);
      setStatusData(breakdownRes.data.statusBreakdown || []);
      setTypeData(breakdownRes.data.typeBreakdown || []);
      setExpiringFDRs(expRes.data.slice(0, 5));
      setRecentAlerts(alertRes.data.slice(0, 5));
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
