import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { Institution, InstitutionRequest, FDR } from '../types';
import {
  Building2,
  Search,
  MapPin,
  Phone,
  Mail,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  ArrowLeft,
  Landmark,
  ShieldCheck,
  Calendar,
  Wallet,
  Eye,
  FileSpreadsheet
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { InstitutionRequestModal } from '../components/InstitutionRequestModal';
import { useAuth } from '../hooks/useAuth';

export const Institutions: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'directory' | 'requests'>('directory');
  
  // Single Institution Profile state (when id param is present)
  const [profileInst, setProfileInst] = useState<Institution | null>(null);
  const [profileFdrs, setProfileFdrs] = useState<FDR[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);

  // Directory state
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);

  // Requests state
  const [requests, setRequests] = useState<InstitutionRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Direct Add Form state (Admin only)
  const [formData, setFormData] = useState({
    aicte_id: '',
    name: '',
    institution_type: 'Engineering',
    state: '',
    city: '',
    address: '',
    contact_person: '',
    contact_email: '',
    contact_phone: '',
  });

  const isBureauOrAdmin = user?.role === 'admin' || user?.role === 'bureau_officer';

  useEffect(() => {
    if (id) {
      fetchInstitutionProfile(id);
    } else {
      fetchInstitutions();
      if (isBureauOrAdmin) {
        fetchRequests();
      }
    }
  }, [id, isBureauOrAdmin]);

  const fetchInstitutionProfile = async (instId: string) => {
    try {
      setProfileLoading(true);
      const [instRes, fdrsRes] = await Promise.all([
        api.get(`/institutions/${instId}`),
        api.get(`/fdrs?institution_id=${instId}`),
      ]);
      setProfileInst(instRes.data);
      const fdrList = fdrsRes.data?.fdrs || (Array.isArray(fdrsRes.data) ? fdrsRes.data : []);
      setProfileFdrs(fdrList);
    } catch (err) {
      console.error('Failed to load institution profile:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  const fetchInstitutions = async () => {
    try {
      setLoading(true);
      const res = await api.get('/institutions');
      setInstitutions(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    try {
      setRequestsLoading(true);
      const res = await api.get('/institutions/requests');
      setRequests(res.data);
    } catch (err) {
      console.error('Failed to load institution requests:', err);
    } finally {
      setRequestsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/institutions', formData);
      setIsAddModalOpen(false);
      setFormData({
        aicte_id: '',
        name: '',
        institution_type: 'Engineering',
        state: '',
        city: '',
        address: '',
        contact_person: '',
        contact_email: '',
        contact_phone: '',
      });
      fetchInstitutions();
      setStatusMessage({ type: 'success', text: 'Institution created and registered successfully.' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.response?.data?.error || 'Failed to create institution.' });
    }
  };

  const handleApprove = async (id: number) => {
    try {
      setActionLoading(true);
      const res = await api.patch(`/institutions/requests/${id}/approve`);
      setStatusMessage({ type: 'success', text: res.data.message || 'Institution onboarding request approved!' });
      fetchRequests();
      fetchInstitutions();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.response?.data?.error || 'Failed to approve onboarding request.' });
    } finally {
      setActionLoading(false);
    }
  };

  const openRejectModal = (id: number) => {
    setSelectedRequestId(id);
    setRejectRemarks('');
    setRejectModalOpen(true);
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequestId || !rejectRemarks.trim()) return;

    try {
      setActionLoading(true);
      await api.patch(`/institutions/requests/${selectedRequestId}/reject`, { remarks: rejectRemarks });
      setRejectModalOpen(false);
      setStatusMessage({ type: 'success', text: 'Onboarding request rejected with remarks recorded.' });
      fetchRequests();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.response?.data?.error || 'Failed to reject request.' });
    } finally {
      setActionLoading(false);
    }
  };

  const pendingRequestsCount = requests.filter((r) => r.status === 'Pending').length;

  const filtered = institutions.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.aicte_id.toLowerCase().includes(search.toLowerCase()) ||
      (i.city && i.city.toLowerCase().includes(search.toLowerCase())) ||
      (i.state && i.state.toLowerCase().includes(search.toLowerCase()))
  );

  const formatCurrency = (amt?: number) => '₹' + (amt || 0).toLocaleString('en-IN');

  // If viewing an individual technical institution's profile
  if (id) {
    if (profileLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-sm font-semibold text-slate-600">Loading Technical Institution Profile & Deposits...</p>
        </div>
      );
    }

    if (!profileInst) {
      return (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-md mx-auto my-12 space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">Institution Not Found</h3>
          <p className="text-xs text-slate-500">The institution with ID #{id} could not be located in the council database.</p>
          <Link
            to="/institutions"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Directory
          </Link>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Top Bar with Return Link */}
        <div className="flex items-center justify-between">
          <Link
            to="/institutions"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-blue-600 shadow-2xs transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Technical Institutions Directory
          </Link>
          <span className="text-xs font-mono text-slate-400">Record ID: #{profileInst.id}</span>
        </div>

        {/* Profile Header Banner */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3.5 bg-blue-50 text-blue-700 rounded-xl border border-blue-100 shrink-0">
                <Building2 className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-slate-900">{profileInst.name}</h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {profileInst.institution_type}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    APH Approved
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                  <span>AICTE Permanent ID: <strong className="font-mono text-slate-700">{profileInst.aicte_id}</strong></span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {profileInst.city ? `${profileInst.city}, ${profileInst.state}` : profileInst.state}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-semibold">Total Security Deposit</span>
              <Wallet className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(profileInst.total_deposit_amount)}</p>
            <p className="text-[10px] text-slate-400 mt-1">{profileFdrs.length} Instruments Registered</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-semibold">Active Compliant FDRs</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xl font-bold text-emerald-700">
              {profileInst.active_fdrs ?? profileFdrs.filter(f => f.status === 'Active').length}
            </p>
            <p className="text-[10px] text-emerald-600 mt-1">Under Active AICTE Joint Lien</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-semibold">Expiring Soon (&lt; 60 Days)</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-xl font-bold text-amber-600">
              {profileInst.expiring_soon_fdrs ?? profileFdrs.filter(f => f.status === 'Expiring Soon').length}
            </p>
            <p className="text-[10px] text-amber-600 mt-1">Nudges / Reminders Triggered</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-semibold">APH Regulatory Health</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xl font-bold text-emerald-600">
              {profileInst.expiring_soon_fdrs && profileInst.expiring_soon_fdrs > 0 ? 'Action Needed' : 'Good Standing'}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">100% Financial Deposit Ratio</p>
          </div>
        </div>

        {/* Main Grid: FDR Instruments Table & Institution Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* FDR Instruments List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Linked Security Deposit Instruments (FDRs)</h3>
                  <p className="text-xs text-slate-400">Fixed Deposit Receipts pledged under Approval Process Handbook (APH)</p>
                </div>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                  {profileFdrs.length} Deposits
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4">FDR Number</th>
                      <th className="py-3 px-4">Issuing Bank &amp; Branch</th>
                      <th className="py-3 px-4">Amount (₹)</th>
                      <th className="py-3 px-4">Maturity Date</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profileFdrs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                          <p className="font-semibold text-slate-600">No FDRs registered for this institution.</p>
                        </td>
                      </tr>
                    ) : (
                      profileFdrs.map((fdr) => (
                        <tr key={fdr.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-blue-700">
                            <Link to={`/fdrs/${fdr.id}`} className="hover:underline">
                              {fdr.fdr_number}
                            </Link>
                            <span className="text-[10px] text-slate-400 block font-sans font-normal">
                              {fdr.deposit_type || 'FDR'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <p className="font-semibold text-slate-800">{fdr.bank_name}</p>
                            <span className="text-[10px] text-slate-400">{fdr.bank_branch || 'Main Branch'}</span>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            {formatCurrency(fdr.deposit_amount)}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            {fdr.maturity_date}
                          </td>
                          <td className="py-3.5 px-4">
                            <Badge status={fdr.status} />
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <Link
                              to={`/fdrs/${fdr.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" /> View
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Institution Dossier Sidebar */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
                Institutional Dossier &amp; Contacts
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Principal / Head</span>
                  <p className="font-semibold text-slate-800">{profileInst.contact_person || 'Not Specified'}</p>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Official Email</span>
                  <a href={`mailto:${profileInst.contact_email}`} className="text-blue-600 hover:underline flex items-center gap-1.5 mt-0.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    {profileInst.contact_email}
                  </a>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Telephone</span>
                  <p className="text-slate-700 flex items-center gap-1.5 mt-0.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    {profileInst.contact_phone || 'Not Specified'}
                  </p>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Campus Address</span>
                  <p className="text-slate-700 flex items-start gap-1.5 mt-0.5 leading-relaxed">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    {profileInst.address ? `${profileInst.address}, ${profileInst.city || ''}, ${profileInst.state}` : `${profileInst.city || ''}, ${profileInst.state}`}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Approval Status</span>
                  <p className="text-emerald-700 font-semibold flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Recognized Technical Institution
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Technical Institutions Directory & Onboarding</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            AICTE-approved colleges, universities, and regulatory admission scrutiny queue
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Public / Institution Onboarding Request button */}
          <button
            onClick={() => setIsOnboardingModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:border-blue-600 hover:bg-blue-50/50 text-slate-700 hover:text-blue-700 rounded-lg text-xs font-semibold transition-colors shadow-2xs"
          >
            <Clock className="w-4 h-4 text-blue-600" />
            <span>Request Addition / Onboarding</span>
          </button>

          {/* Direct Add button (Admin only) */}
          {user?.role === 'admin' && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Direct Add Institution</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Banner */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-600 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Tabs (For Officers & Admins) */}
      {isBureauOrAdmin && (
        <div className="flex border-b border-slate-200 gap-6 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('directory')}
            className={`pb-3 relative transition-colors ${
              activeTab === 'directory'
                ? 'text-blue-600 border-b-2 border-blue-600 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Approved Institutions ({institutions.length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`pb-3 relative flex items-center gap-2 transition-colors ${
              activeTab === 'requests'
                ? 'text-blue-600 border-b-2 border-blue-600 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Onboarding Approval Queue</span>
            {pendingRequestsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white animate-pulse">
                {pendingRequestsCount} Pending
              </span>
            )}
          </button>
        </div>
      )}

      {/* TAB 1: APPROVED DIRECTORY */}
      {activeTab === 'directory' && (
        <div className="space-y-6">
          {/* Search Input */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Institution name, AICTE ID, city, or state..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>

          {/* Grid of Institution Cards */}
          {loading ? (
            <div className="flex items-center justify-center min-h-[40vh]">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-xl border border-slate-200 text-slate-400 text-xs">
              No institutions found matching the search query.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((inst) => (
                <div
                  key={inst.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg shrink-0">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded uppercase">
                        {inst.institution_type || 'Technical'}
                      </span>
                    </div>

                    <div className="mt-3">
                      <h3 className="font-bold text-sm text-slate-800 line-clamp-2">{inst.name}</h3>
                      <p className="text-xs text-blue-600 font-semibold mt-0.5">{inst.aicte_id}</p>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {inst.city ? `${inst.city}, ` : ''}
                          {inst.state || 'India'}
                        </span>
                      </div>
                      {inst.contact_person && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-700">Contact:</span>
                          <span>{inst.contact_person}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Deposit Financial Snapshot */}
                  <div className="mt-5 pt-4 border-t border-slate-100 bg-slate-50/60 -mx-5 -mb-5 p-5 rounded-b-xl">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total Deposits</span>
                        <span className="font-bold text-slate-900 text-sm">{formatCurrency(inst.total_deposit_amount)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Instruments</span>
                        <span className="font-bold text-blue-700 text-sm">{inst.total_fdrs || 0} Records</span>
                      </div>
                    </div>

                    <Link
                      to={`/fdrs?institution_id=${inst.id}`}
                      className="mt-3 w-full block text-center py-1.5 bg-white border border-slate-200 hover:border-blue-500 text-slate-700 hover:text-blue-700 text-xs font-semibold rounded-lg transition-colors shadow-2xs"
                    >
                      View Linked FDRs →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ONBOARDING APPROVAL QUEUE */}
      {activeTab === 'requests' && isBureauOrAdmin && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Institutional Addition Scrutiny Queue
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Review applicant colleges, verify AICTE accreditation credentials, and approve or reject profiles
                </p>
              </div>
              <button
                onClick={fetchRequests}
                className="px-3 py-1 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 rounded text-xs"
              >
                Refresh Queue
              </button>
            </div>

            {requestsLoading ? (
              <div className="p-12 text-center text-xs text-slate-400">Loading requests queue...</div>
            ) : requests.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">
                No institution onboarding requests have been submitted yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {requests.map((req) => (
                  <div key={req.id} className="p-5 hover:bg-slate-50/50 transition-colors">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Left: Info */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-800">{req.name}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                            {req.aicte_id}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                            {req.institution_type}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              req.status === 'Pending'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : req.status === 'Approved'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}
                          >
                            ● {req.status}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {req.city}, {req.state}
                          </span>
                          <span className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            {req.contact_email}
                          </span>
                          {req.contact_phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5 text-slate-400" />
                              {req.contact_phone}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-slate-400 text-[11px]">
                            <Clock className="w-3.5 h-3.5" />
                            Submitted: {req.requested_at}
                          </span>
                        </div>

                        {req.justification && (
                          <div className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-slate-600 mt-2">
                            <span className="font-semibold text-slate-700">Justification / LOA Note: </span>
                            {req.justification}
                          </div>
                        )}

                        {req.remarks && (
                          <div className="text-xs bg-rose-50 p-2 rounded-lg border border-rose-100 text-rose-700 mt-1">
                            <span className="font-semibold">Council Decision Remarks: </span>
                            {req.remarks}
                          </div>
                        )}
                      </div>

                      {/* Right: Actions */}
                      {req.status === 'Pending' && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            disabled={actionLoading}
                            onClick={() => handleApprove(req.id)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve & Register</span>
                          </button>
                          <button
                            disabled={actionLoading}
                            onClick={() => openRejectModal(req.id)}
                            className="px-3.5 py-2 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      )}

                      {req.status === 'Approved' && (
                        <div className="text-right text-[11px] text-slate-400 shrink-0">
                          <span className="text-emerald-700 font-semibold block">✓ Active in Directory</span>
                          <span>Reviewed by: {req.reviewer_name || 'Council Officer'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject Modal */}
      <Modal isOpen={rejectModalOpen} onClose={() => setRejectModalOpen(false)} title="Reject Onboarding Application">
        <form onSubmit={handleRejectSubmit} className="space-y-4">
          <p className="text-xs text-slate-500">
            Specify the regulatory grounds for rejecting this institution's addition request (e.g., missing AICTE LOA letter, duplicate registration, or lack of state affiliation).
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Rejection Grounds & Remarks <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="e.g. Invalid AICTE Permanent ID; Letter of Approval verification failed..."
              value={rejectRemarks}
              onChange={(e) => setRejectRemarks(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setRejectModalOpen(false)}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              {actionLoading ? 'Recording...' : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Onboarding Request Modal */}
      <InstitutionRequestModal
        isOpen={isOnboardingModalOpen}
        onClose={() => setIsOnboardingModalOpen(false)}
        onSuccess={() => {
          if (isBureauOrAdmin) fetchRequests();
        }}
      />

      {/* Direct Add Institution Modal (Admin Only) */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Direct Add Technical Institution">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                AICTE Permanent ID <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="AICTE-2024-XX-000"
                value={formData.aicte_id}
                onChange={(e) => setFormData({ ...formData, aicte_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Institution Category</label>
              <select
                value={formData.institution_type}
                onChange={(e) => setFormData({ ...formData, institution_type: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white"
              >
                <option value="Engineering">Engineering & Technology</option>
                <option value="MBA">Management (MBA/PGDM)</option>
                <option value="Pharmacy">Pharmacy</option>
                <option value="Polytechnic">Polytechnic Diploma</option>
                <option value="Architecture">Architecture</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Full Institution Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. National Institute of Technology"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
              <input
                type="text"
                placeholder="State / UT"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
              <input
                type="text"
                placeholder="City"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Person (Principal / Registrar)</label>
            <input
              type="text"
              placeholder="Full Name"
              value={formData.contact_person}
              onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Official Email</label>
              <input
                type="email"
                placeholder="principal@inst.edu.in"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
              <input
                type="text"
                placeholder="020-XXXXXX"
                value={formData.contact_phone}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-blue-600 text-white font-semibold text-xs rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save Institution
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
