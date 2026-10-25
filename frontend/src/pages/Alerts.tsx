import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { Alert, NotificationLog } from '../types';
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
  MessageCircle,
  Smartphone,
  Mail,
  Send,
  Zap,
  Radio,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const Alerts: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'alerts' | 'notifications'>('alerts');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('0'); // 0 = unresolved
  const [channelFilter, setChannelFilter] = useState('');
  const [triggeringNudges, setTriggeringNudges] = useState(false);

  useEffect(() => {
    if (activeTab === 'alerts') {
      fetchAlerts();
    } else {
      fetchNotificationLogs();
    }
  }, [activeTab, severityFilter, typeFilter, statusFilter, channelFilter]);

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

  const fetchNotificationLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        ...(channelFilter && { channel: channelFilter }),
      });
      const res = await api.get(`/notifications?${params.toString()}`);
      setNotificationLogs(res.data);
    } catch (err) {
      console.error('Error fetching notification logs:', err);
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

  const handleTriggerNudges = async () => {
    setTriggeringNudges(true);
    try {
      await api.post('/notifications/trigger-nudges');
      fetchNotificationLogs();
    } catch (err) {
      console.error(err);
    } finally {
      setTriggeringNudges(false);
    }
  };

  const isBureauOrAdmin = user?.role === 'admin' || user?.role === 'bureau_officer';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Automated Compliance Tracking & Multi-Channel Nudges</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Active notifications, maturity tracking, and multi-channel statutory alerts (WhatsApp, SMS, Email)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'alerts' && isBureauOrAdmin && (
            <button
              onClick={handleTriggerEvaluation}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Scan Maturity Timelines</span>
            </button>
          )}

          {activeTab === 'notifications' && (
            <button
              onClick={handleTriggerNudges}
              disabled={triggeringNudges}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{triggeringNudges ? 'Dispatching Nudges...' : '⚡ Dispatch 60/30/15/7-Day Nudges'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary Tab Switcher */}
      <div className="flex gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'alerts'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Active Scrutiny Alerts</span>
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'notifications'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Multi-Channel Statutory Nudges (WhatsApp / SMS / Email)</span>
        </button>
      </div>

      {activeTab === 'alerts' ? (
        <>
          {/* Filter Header for Alerts */}
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
              <option value="">All Alert Categories</option>
              <option value="Maturity">Maturity Timeline</option>
              <option value="Renewal">Renewal Obligation</option>
              <option value="Discrepancy">Bank Scrutiny Discrepancy</option>
              <option value="Missing_Doc">Missing Mandatory Record</option>
            </select>
          </div>

          {/* Alerts List */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-2"></div>
                <p className="text-xs">Scanning compliance logs...</p>
              </div>
            ) : alerts.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                <p className="font-semibold text-slate-600">No active alerts requiring intervention.</p>
                <p className="text-xs mt-0.5">All monitored security deposits are currently compliant.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {alerts.map((alert) => (
                  <div key={alert.id} className="p-5 flex items-start justify-between gap-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-3.5">
                      <div className="mt-0.5">
                        <Badge status={alert.severity} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 leading-snug">{alert.message}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                          <Link to={`/fdrs/${alert.fdr_id}`} className="font-semibold text-blue-600 hover:underline">
                            Instrument: {alert.fdr_number}
                          </Link>
                          <span>•</span>
                          <span>Institution: {alert.institution_name}</span>
                          <span>•</span>
                          <span>Category: {alert.alert_type}</span>
                          <span>•</span>
                          <span>Generated: {alert.created_at}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        to={`/fdrs/${alert.fdr_id}`}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                      </Link>

                      {alert.is_resolved === 0 && (
                        <button
                          onClick={() => handleResolve(alert.id)}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold border border-emerald-200 transition-colors flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Resolve</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Multi-Channel Nudge Engine Overview & Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400">WhatsApp Nudges</p>
                <p className="text-lg font-bold text-slate-800">
                  {notificationLogs.filter(n => n.channel === 'WhatsApp').length} Dispatched
                </p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400">SMS Alerts</p>
                <p className="text-lg font-bold text-slate-800">
                  {notificationLogs.filter(n => n.channel === 'SMS').length} Dispatched
                </p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-3">
              <div className="p-2.5 bg-purple-50 text-purple-600 rounded-lg">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400">Official Emails</p>
                <p className="text-lg font-bold text-slate-800">
                  {notificationLogs.filter(n => n.channel === 'Email').length} Dispatched
                </p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-900 to-indigo-900 text-white p-4 rounded-xl flex items-center gap-3">
              <div className="p-2.5 bg-white/10 rounded-lg text-blue-300">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-blue-200">Statutory Milestones</p>
                <p className="text-xs font-semibold text-white">60d, 30d, 15d, 7d Cycles</p>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
              >
                <option value="">All Transmission Channels</option>
                <option value="WhatsApp">WhatsApp Business API</option>
                <option value="SMS">Telecom SMS Gateway</option>
                <option value="Email">Official NIC / Council Email</option>
              </select>
            </div>
            <p className="text-xs text-slate-400">
              Synchronous notifications dispatched simultaneously to Principal, Chairman & Accounts Officer
            </p>
          </div>

          {/* Notifications Log Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Channel & Milestone</th>
                    <th className="py-3 px-4">Targeted Stakeholder</th>
                    <th className="py-3 px-4">Instrument & College</th>
                    <th className="py-3 px-4">Notification Dispatch Content</th>
                    <th className="py-3 px-4 text-right">Delivery Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-2"></div>
                        <p>Loading multi-channel transmission records...</p>
                      </td>
                    </tr>
                  ) : notificationLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        <Radio className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold text-slate-600">No automated nudges logged yet.</p>
                        <p className="text-xs mt-0.5">Click "Dispatch 60/30/15/7-Day Nudges" to initiate automated transmissions.</p>
                      </td>
                    </tr>
                  ) : (
                    notificationLogs.map((log) => {
                      const ChannelIcon = log.channel === 'WhatsApp' ? MessageCircle : log.channel === 'SMS' ? Smartphone : Mail;
                      const channelColor = log.channel === 'WhatsApp' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
                        log.channel === 'SMS' ? 'text-blue-600 bg-blue-50 border-blue-200' :
                        'text-purple-600 bg-purple-50 border-purple-200';

                      return (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className={`p-1.5 rounded-lg border ${channelColor}`}>
                                <ChannelIcon className="w-4 h-4" />
                              </span>
                              <div>
                                <span className="font-bold text-slate-800">{log.channel}</span>
                                <span className="text-[10px] text-amber-600 block font-semibold">
                                  {log.trigger_days ?? (log as any).days_before_maturity ?? 0} Days Pre-Maturity Nudge
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <p className="font-semibold text-slate-800">{log.recipient_role}</p>
                            <span className="text-[10px] font-mono text-slate-500">{log.recipient_contact}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <Link to={`/fdrs/${log.fdr_id}`} className="font-bold text-blue-600 hover:underline">
                              {log.fdr_number}
                            </Link>
                            <p className="text-[10px] text-slate-500 truncate max-w-[160px]">{log.institution_name}</p>
                          </td>
                          <td className="py-3.5 px-4 max-w-sm">
                            <p className="text-slate-700 text-[11px] leading-relaxed line-clamp-2 bg-slate-50 p-2 rounded border border-slate-100">
                              {log.message || (log as any).message_body}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              {log.delivery_status}
                            </span>
                            <span className="text-[10px] text-slate-400 block mt-1">
                              {new Date(log.sent_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
