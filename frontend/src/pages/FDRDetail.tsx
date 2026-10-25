import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { FDR, FDRDocument, AuditLogEntry, DisputeTicket, DisputeMessage } from '../types';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { FDRForm } from '../components/FDR/FDRForm';
import {
  ArrowLeft,
  Building2,
  Calendar,
  FileText,
  Upload,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  ArrowUpRightFromCircle,
  Clock,
  History,
  FileCheck,
  Download,
  Trash2,
  ShieldCheck,
  MessageSquare,
  Send,
  CheckCheck,
  Copy,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const FDRDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [fdr, setFdr] = useState<FDR | null>(null);
  const [loading, setLoading] = useState(true);

  // Dispute & Clarification State
  const [disputes, setDisputes] = useState<DisputeTicket[]>([]);
  const [activeTicket, setActiveTicket] = useState<DisputeTicket | null>(null);
  const [newMsg, setNewMsg] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketComment, setTicketComment] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Modals
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);

  // Verification Form State
  const [verifyStatus, setVerifyStatus] = useState<'Verified' | 'Discrepancy'>('Verified');
  const [verifyNotes, setVerifyNotes] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);

  // Release Request Form State
  const [releaseType, setReleaseType] = useState('Release');
  const [releaseReason, setReleaseReason] = useState('');
  const [releaseRemarks, setReleaseRemarks] = useState('');
  const [releaseSubmitting, setReleaseSubmitting] = useState(false);

  // Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('FDR_Certificate');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchFDRDetail();
    fetchDisputes();
  }, [id]);

  const fetchFDRDetail = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/fdrs/${id}`);
      setFdr(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDisputes = async () => {
    try {
      const res = await api.get(`/disputes?fdr_id=${id}`);
      setDisputes(res.data);
      if (res.data.length > 0 && !activeTicket) {
        // Load messages for the first ticket
        const ticketRes = await api.get(`/disputes/${res.data[0].id}`);
        setActiveTicket(ticketRes.data);
      }
    } catch (err) {
      console.error('Error fetching disputes:', err);
    }
  };

  const selectTicket = async (ticket: DisputeTicket) => {
    try {
      const res = await api.get(`/disputes/${ticket.id}`);
      setActiveTicket(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendMsg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !newMsg.trim()) return;
    setSendingMsg(true);
    try {
      await api.post(`/disputes/${activeTicket.id}/messages`, {
        message: newMsg.trim(),
      });
      setNewMsg('');
      const updated = await api.get(`/disputes/${activeTicket.id}`);
      setActiveTicket(updated.data);
      fetchDisputes();
    } catch (err) {
      console.error(err);
    } finally {
      setSendingMsg(false);
    }
  };

  const handleResolveDispute = async (ticketId: number) => {
    const notes = prompt('Enter resolution notes / remarks:');
    if (!notes) return;
    try {
      await api.patch(`/disputes/${ticketId}/resolve`, { resolution_notes: notes });
      fetchDisputes();
      if (activeTicket?.id === ticketId) {
        const updated = await api.get(`/disputes/${ticketId}`);
        setActiveTicket(updated.data);
      }
      fetchFDRDetail();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketComment.trim()) return;
    setCreatingTicket(true);
    try {
      await api.post('/disputes', {
        fdr_id: id,
        subject: ticketSubject.trim(),
        initial_comment: ticketComment.trim(),
      });
      setIsNewTicketModalOpen(false);
      setTicketSubject('');
      setTicketComment('');
      fetchDisputes();
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingTicket(false);
    }
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2500);
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyLoading(true);
    try {
      await api.patch(`/fdrs/${id}/verify`, {
        verification_status: verifyStatus,
        verification_notes: verifyNotes,
      });
      setIsVerifyModalOpen(false);
      fetchFDRDetail();
    } catch (err) {
      console.error(err);
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleReleaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReleaseSubmitting(true);
    try {
      await api.post('/releases', {
        fdr_id: fdr?.id,
        request_type: releaseType,
        reason: releaseReason,
        remarks: releaseRemarks,
      });
      setIsReleaseModalOpen(false);
      navigate('/releases');
    } catch (err) {
      console.error(err);
    } finally {
      setReleaseSubmitting(false);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('document_type', docType);

    try {
      await api.post(`/fdrs/${id}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSelectedFile(null);
      fetchFDRDetail();
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (docId: number) => {
    if (!confirm('Are you sure you want to deactivate this document?')) return;
    try {
      await api.delete(`/fdrs/${id}/documents/${docId}`);
      fetchFDRDetail();
    } catch (err) {
      console.error(err);
    }
  };

  const formatCurrency = (amt: number) => '₹' + amt.toLocaleString('en-IN');

  if (loading || !fdr) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const isBureauOrAdmin = user?.role === 'admin' || user?.role === 'bureau_officer';

  return (
    <div className="space-y-6">
      {/* Top back nav & title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/fdrs"
            className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-800">{fdr.fdr_number}</h2>
              <Badge status={fdr.status} />
              <Badge status={fdr.verification_status} />
              {fdr.is_renewal === 1 && (
                <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-bold">
                  RENEWAL INSTRUMENT
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Issued by <span className="font-semibold text-slate-700">{fdr.bank_name}</span> for{' '}
              <span className="font-semibold text-slate-700">{fdr.institution_name}</span> ({fdr.aicte_id})
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {isBureauOrAdmin && (
            <button
              onClick={() => {
                setVerifyNotes(fdr.verification_notes || '');
                setIsVerifyModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Verify / Flag Scrutiny</span>
            </button>
          )}

          {user?.role !== 'viewer' && fdr.status !== 'Released' && (
            <button
              onClick={() => setIsRenewModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Renew / Replace</span>
            </button>
          )}

          {user?.role !== 'viewer' && fdr.status !== 'Released' && (
            <button
              onClick={() => setIsReleaseModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <ArrowUpRightFromCircle className="w-4 h-4" />
              <span>Initiate Release Request</span>
            </button>
          )}
        </div>
      </div>

      {/* Discrepancy Alert Banner if any */}
      {fdr.verification_status === 'Discrepancy' && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wide">Verification Discrepancy Flagged</h4>
            <p className="text-xs text-rose-700 mt-0.5 font-medium">{fdr.verification_notes}</p>
            <p className="text-[11px] text-rose-500 mt-1">
              Scrutinized by: {fdr.verified_by_name || 'Regulation Officer'} • Status: Immediate resolution requested
            </p>
          </div>
        </div>
      )}

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Financial Instrument Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Financial Instrument Specification
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
              <div>
                <span className="text-xs text-slate-400 block">Principal Deposit</span>
                <span className="text-xl font-bold text-slate-900 mt-0.5 block">
                  {formatCurrency(fdr.deposit_amount)}
                </span>
                <span className="text-[11px] text-slate-400">{fdr.currency}</span>
              </div>

              <div>
                <span className="text-xs text-slate-400 block">Instrument Type</span>
                <span className="text-sm font-semibold text-slate-800 mt-1 block">{fdr.deposit_type}</span>
              </div>

              <div>
                <span className="text-xs text-slate-400 block">Interest Rate</span>
                <span className="text-sm font-semibold text-slate-800 mt-1 block">
                  {fdr.interest_rate ? `${fdr.interest_rate}% p.a.` : 'Not Specified'}
                </span>
              </div>

              <div>
                <span className="text-xs text-slate-400 block">Issuing Bank</span>
                <span className="text-sm font-semibold text-slate-800 mt-1 block">{fdr.bank_name}</span>
                <span className="text-[11px] text-slate-400">{fdr.bank_branch || 'Branch N/A'}</span>
              </div>

              <div>
                <span className="text-xs text-slate-400 block">Linked Bank Account</span>
                <span className="text-sm font-semibold text-slate-800 mt-1 block">
                  {fdr.account_number || 'Confidential / N/A'}
                </span>
              </div>

              <div>
                <span className="text-xs text-slate-400 block">Approval Purpose</span>
                <span className="text-sm font-semibold text-slate-800 mt-1 block">{fdr.purpose || 'General Deposit'}</span>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <span className="text-xs text-slate-400 block">Date of Issue</span>
                <span className="text-sm font-semibold text-slate-800 mt-1 block">{fdr.issue_date}</span>
              </div>

              <div>
                <span className="text-xs text-slate-400 block">Maturity / Expiry Date</span>
                <span className="text-sm font-semibold text-slate-800 mt-1 block">{fdr.maturity_date}</span>
              </div>

              <div>
                <span className="text-xs text-slate-400 block">Validity Countdown</span>
                <div className="mt-1">
                  {fdr.days_to_maturity !== undefined && (
                    fdr.days_to_maturity < 0 ? (
                      <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                        Matured {Math.abs(fdr.days_to_maturity)} days ago
                      </span>
                    ) : fdr.days_to_maturity <= 30 ? (
                      <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                        {fdr.days_to_maturity} days remaining
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        {fdr.days_to_maturity} days remaining
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>

            {fdr.remarks && (
              <div className="pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-400 block">Administrative Notes</span>
                <p className="text-xs text-slate-600 mt-1 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  {fdr.remarks}
                </p>
              </div>
            )}
          </div>

          {/* Digital Document Storage */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                  Prescribed Digital Documents
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Bank-issued FDR certificates, verification confirmation letters & receipts
                </p>
              </div>
            </div>

            {/* Upload Area */}
            {user?.role !== 'viewer' && (
              <form onSubmit={handleFileUpload} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Document Category</label>
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none"
                    >
                      <option value="FDR_Certificate">Bank FDR Receipt / Certificate</option>
                      <option value="Bank_Letter">Issuing Bank Confirmation Letter</option>
                      <option value="Lien_Marking">AICTE Lien Endorsement Letter</option>
                      <option value="Supporting_Doc">General Supporting Record</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Select File (PDF, PNG, JPG)</label>
                    <input
                      type="file"
                      required
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                      className="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={uploading || !selectedFile}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploading ? 'Uploading...' : 'Upload & Archive Document'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Documents List */}
            <div className="divide-y divide-slate-100">
              {fdr.documents && fdr.documents.length > 0 ? (
                fdr.documents.map((doc) => (
                  <div key={doc.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-50 text-blue-700 rounded-lg mt-0.5">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{doc.file_name}</p>
                        <p className="text-[11px] text-slate-400">
                          {doc.document_type.replace('_', ' ')} • Uploaded {doc.uploaded_at}
                        </p>
                        {/* Blockchain / Cryptographic SHA-256 Stamp */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            SHA-256: {doc.sha256_hash ? `${doc.sha256_hash.slice(0, 8)}...${doc.sha256_hash.slice(-8)}` : 'e3b0c442...98fc7182'}
                          </span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                            Immutable Vault Anchor
                          </span>
                          <button
                            type="button"
                            onClick={() => copyHash(doc.sha256_hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')}
                            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Copy Cryptographic SHA-256 Hash"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          {copiedHash === (doc.sha256_hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') && (
                            <span className="text-[10px] text-emerald-600 font-bold">Copied!</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <a
                        href={`/uploads/${doc.file_path}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors"
                        title="Open Document"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      {isBureauOrAdmin && (
                        <button
                          onClick={() => handleDeleteDoc(doc.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          title="Remove Document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 py-4 text-center">
                  No documents have been archived for this instrument yet.
                </p>
              )}
            </div>
          </div>

          {/* Dynamic Dispute & Clarification Threading Module */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-blue-600" />
                    Dispute & Clarification Resolution Module
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700">
                    Threaded Audit
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Direct structured communications between Technical Institution and AICTE Bureau Officers
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsNewTicketModalOpen(true)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold transition-colors self-start sm:self-auto"
              >
                + Raise Clarification Ticket
              </button>
            </div>

            {disputes.length === 0 ? (
              <div className="text-center py-6 text-slate-400">
                <CheckCheck className="w-8 h-8 mx-auto text-emerald-500 mb-2 opacity-80" />
                <p className="text-xs font-medium text-slate-600">No discrepancies or dispute tickets open for this instrument.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Use the clarification module if deposit amounts, lien endorsements, or maturity records require Council scrutiny.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Tickets Selector Tab Strip */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {disputes.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => selectTicket(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 shrink-0 transition-colors ${
                        activeTicket?.id === t.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <span className="truncate max-w-[180px]">{t.subject}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                        t.status === 'Resolved' ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-slate-900'
                      }`}>
                        {t.status}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Active Ticket Message Box */}
                {activeTicket && (
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">{activeTicket.subject}</h4>
                        <p className="text-[10px] text-slate-400">
                          Opened by {activeTicket.created_by_name} • {new Date(activeTicket.created_at).toLocaleString('en-IN')}
                        </p>
                      </div>
                      {isBureauOrAdmin && activeTicket.status !== 'Resolved' && (
                        <button
                          onClick={() => handleResolveDispute(activeTicket.id)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-semibold transition-colors"
                        >
                          Resolve & Clear Discrepancy
                        </button>
                      )}
                    </div>

                    {/* Messages Thread */}
                    <div className="space-y-3 max-h-72 overflow-y-auto pr-2">
                      {activeTicket.messages?.map((msg) => {
                        const isCouncil = msg.sender_role === 'admin' || msg.sender_role === 'bureau_officer';
                        return (
                          <div
                            key={msg.id}
                            className={`p-3 rounded-xl text-xs max-w-[85%] ${
                              isCouncil
                                ? 'bg-blue-50 border border-blue-200 ml-auto text-blue-950'
                                : 'bg-white border border-slate-200 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="font-bold text-[11px] text-slate-700">
                                {msg.sender_name} ({isCouncil ? 'AICTE Council' : 'Institution'})
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="leading-relaxed">{msg.message}</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Reply Input Form */}
                    {activeTicket.status !== 'Resolved' ? (
                      <form onSubmit={handleSendMsg} className="flex gap-2">
                        <input
                          type="text"
                          required
                          value={newMsg}
                          onChange={(e) => setNewMsg(e.target.value)}
                          placeholder="Type your official clarification or reply here..."
                          className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:border-blue-500"
                        />
                        <button
                          type="submit"
                          disabled={sendingMsg || !newMsg.trim()}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{sendingMsg ? 'Posting...' : 'Send'}</span>
                        </button>
                      </form>
                    ) : (
                      <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg text-emerald-800 text-xs flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>This clarification ticket has been officially resolved. All discrepancy flags cleared.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Institution Info + Audit Trail */}
        <div className="space-y-6">
          {/* Institution Summary Box */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Technical Institution
            </h3>
            <div>
              <p className="text-sm font-bold text-slate-800">{fdr.institution_name}</p>
              <span className="text-xs text-blue-600 font-semibold">{fdr.aicte_id}</span>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Authorized Contact:</span>
                <span className="font-medium text-slate-700">{fdr.contact_person || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Email:</span>
                <span className="font-medium text-slate-700">{fdr.contact_email || 'N/A'}</span>
              </div>
            </div>

            <Link
              to={`/institutions/${fdr.institution_id}`}
              className="block w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-center font-semibold rounded-lg text-xs transition-colors border border-slate-200"
            >
              View Institution Profile →
            </Link>
          </div>

          {/* Traceable Audit Trail */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Traceable Audit Trail
              </h3>
              <History className="w-4 h-4 text-slate-400" />
            </div>

            <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
              {fdr.audit && fdr.audit.length > 0 ? (
                fdr.audit.map((entry) => (
                  <div key={entry.id} className="relative pl-5 border-l-2 border-slate-200 pb-3 last:pb-0">
                    <div className="absolute -left-1.5 top-0.5 w-3 h-3 rounded-full bg-blue-600 border-2 border-white"></div>
                    <p className="text-xs font-bold text-slate-800">{entry.action}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{entry.notes || 'Status modification logged'}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      By {entry.changed_by_name || 'System'} • {entry.changed_at}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 text-center py-2">No audit actions recorded.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Verification Scrutiny Modal */}
      <Modal
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
        title="Official Scrutiny & Bank Verification"
      >
        <form onSubmit={handleVerifySubmit} className="space-y-4">
          <p className="text-xs text-slate-500">
            Confirm whether this security instrument has been verified with issuing bank records, or flag discrepancies requiring institutional response.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Verification Status Decision</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setVerifyStatus('Verified')}
                className={`p-3 rounded-lg border text-left text-xs font-semibold transition-all ${
                  verifyStatus === 'Verified'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-600/20'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                ✓ Legitimate & Verified
              </button>
              <button
                type="button"
                onClick={() => setVerifyStatus('Discrepancy')}
                className={`p-3 rounded-lg border text-left text-xs font-semibold transition-all ${
                  verifyStatus === 'Discrepancy'
                    ? 'border-rose-600 bg-rose-50 text-rose-800 ring-2 ring-rose-600/20'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                ⚠ Flag Discrepancy
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Scrutiny Observations & Discrepancy Details
            </label>
            <textarea
              required={verifyStatus === 'Discrepancy'}
              rows={3}
              value={verifyNotes}
              onChange={(e) => setVerifyNotes(e.target.value)}
              placeholder="e.g. Bank confirmation email reference, amount mismatch, or lack of joint lien..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsVerifyModalOpen(false)}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={verifyLoading}
              className="px-4 py-1.5 bg-blue-600 text-white font-semibold text-xs rounded-lg hover:bg-blue-700 transition-colors"
            >
              {verifyLoading ? 'Recording...' : 'Save Scrutiny Record'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Renewal Modal */}
      <Modal
        isOpen={isRenewModalOpen}
        onClose={() => setIsRenewModalOpen(false)}
        title="Submit Renewal / Replacement FDR"
        maxWidth="2xl"
      >
        <FDRForm
          isRenewal={true}
          initialData={fdr}
          onSuccess={() => {
            setIsRenewModalOpen(false);
            fetchFDRDetail();
          }}
          onCancel={() => setIsRenewModalOpen(false)}
        />
      </Modal>

      {/* Release Request Modal */}
      <Modal
        isOpen={isReleaseModalOpen}
        onClose={() => setIsReleaseModalOpen(false)}
        title="Initiate Security Deposit Release / Refund Request"
      >
        <form onSubmit={handleReleaseSubmit} className="space-y-4">
          <p className="text-xs text-slate-500">
            Submit a formal request to release or refund this security deposit upon completion of applicable regulatory conditions.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Request Action Type</label>
            <select
              value={releaseType}
              onChange={(e) => setReleaseType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white"
            >
              <option value="Release">Release & Lien Discharge</option>
              <option value="Refund">Direct Refund of Deposited Capital</option>
              <option value="Discharge">Administrative Discharge</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Regulatory Justification / Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={releaseReason}
              onChange={(e) => setReleaseReason(e.target.value)}
              placeholder="e.g. Completion of mandatory 10-year term without violation, replacement FDR submitted, or approved course closure..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Supporting Reference Remarks</label>
            <input
              type="text"
              value={releaseRemarks}
              onChange={(e) => setReleaseRemarks(e.target.value)}
              placeholder="Approval letter reference number, council order ID, etc."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsReleaseModalOpen(false)}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={releaseSubmitting}
              className="px-4 py-1.5 bg-blue-600 text-white font-semibold text-xs rounded-lg hover:bg-blue-700 transition-colors"
            >
              {releaseSubmitting ? 'Submitting...' : 'Submit Release Request'}
            </button>
          </div>
        </form>
      </Modal>

      {/* New Clarification & Dispute Ticket Modal */}
      <Modal
        isOpen={isNewTicketModalOpen}
        onClose={() => setIsNewTicketModalOpen(false)}
        title="Raise Clarification / Dispute Ticket"
      >
        <form onSubmit={handleCreateTicket} className="space-y-4">
          <p className="text-xs text-slate-500">
            Open a formal, auditable resolution thread regarding this instrument ({fdr?.fdr_number}). Both AICTE Bureau Officers and Institution authorized representatives can participate.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Issue Subject / Category <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={ticketSubject}
              onChange={(e) => setTicketSubject(e.target.value)}
              placeholder="e.g. Discrepancy in deposit amount vs sanction letter, Lien stamp clarification"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Initial Clarification Note / Observations <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={ticketComment}
              onChange={(e) => setTicketComment(e.target.value)}
              placeholder="Describe the specific discrepancy observed or provide clarification requested by Council..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsNewTicketModalOpen(false)}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creatingTicket || !ticketSubject.trim() || !ticketComment.trim()}
              className="px-4 py-1.5 bg-blue-600 text-white font-semibold text-xs rounded-lg hover:bg-blue-700 transition-colors"
            >
              {creatingTicket ? 'Creating...' : 'Open Formal Thread'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
