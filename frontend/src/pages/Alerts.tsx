import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { Alert } from '../types';
import { Badge } from '../components/ui/Badge';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  FileQuestion,
  Filter,
  Check,
  Eye,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const Alerts: React.FC = () => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('0'); // 0 = unresolved

  useEffect(() => {
    fetchAlerts();
  }, [severityFilter, typeFilter, statusFilter]);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        ...(statusFilter !== '' && { is_resolved: statusFilter }),
        ...(severityFilter && { severity: severityFilter }),
        ...(typeFilter && { alert_type: typeFilter }),
      });
      const res = await api.get(`/alerts?${params.toString()}`);
      setAlerts(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (alertId: number) => {
    try {
      await api.patch(`/alerts/${alertId}/resolve`);
      fetchAlerts();
    } catch (err) {
      console.error(err);
    }
  };

  const handleTriggerEvaluation = async () => {
    try {
      await api.post('/alerts/generate');
      fetchAlerts();
    } catch (err) {
      console.error(err);
    }
  };

  const isBureauOrAdmin = user?.role === 'admin' || user?.role === 'bureau_officer';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Automated Validity & Maturity Tracking</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Active notifications for expiring deposits, renewal obligations, and verification discrepancies
          </p>
        </div>

        {isBureauOrAdmin && (
          <button
            onClick={handleTriggerEvaluation}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Scan Maturity Timelines Now</span>
          </button>
        )}
      </div>

      {/* Filter Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
        >
          <option value="0">Unresolved Alerts</option>
          <option value="1">Resolved Historical Alerts</option>
          <option value="">All Notifications</option>
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
        >
          <option value="">All Severities</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
        >
          <option value="">All Alert Types</option>
          <option value="Maturity">Approaching Maturity</option>
          <option value="Renewal">Renewal Overdue</option>
          <option value="Discrepancy">Verification Discrepancy</option>
          <option value="Missing_Doc">Missing Supporting Document</option>
        </select>
      </div>

      {/* Alerts Feed */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-2"></div>
            <p className="text-xs">Checking compliance alert queue...</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
            <p className="font-semibold text-slate-700 text-sm">No regulatory alerts match selected filters.</p>
            <p className="text-xs mt-0.5">All tracked financial instruments meet current compliance standards.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors ${
                  alert.is_resolved === 1 ? 'bg-slate-50/50 opacity-75' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5">
                    <Badge status={alert.severity} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 tracking-tight">
                        {alert.alert_type.replace('_', ' ')}
                      </span>
                      {alert.due_date && (
                        <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-medium">
                          Due by: {alert.due_date}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-700 mt-1 font-medium">{alert.message}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                      <span>{alert.institution_name}</span>
                      <span>•</span>
                      <span>Instrument: {alert.fdr_number}</span>
                      <span>•</span>
                      <span>Logged: {alert.created_at}</span>
                      {alert.resolved_by_name && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-700 font-medium">Resolved by {alert.resolved_by_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <Link
                    to={`/fdrs/${alert.fdr_id}`}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Inspect FDR</span>
                  </Link>
                  {isBureauOrAdmin && alert.is_resolved === 0 && (
                    <button
                      onClick={() => handleResolve(alert.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Mark Resolved</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
