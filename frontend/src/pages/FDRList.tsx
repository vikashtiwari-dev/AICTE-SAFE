import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { FDR, Institution } from '../types';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { FDRForm } from '../components/FDR/FDRForm';
import {
  Search,
  Filter,
  Plus,
  Download,
  Eye,
  Building2,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const FDRList: React.FC = () => {
  const { user } = useAuth();
  const [fdrs, setFdrs] = useState<FDR[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState('');
  const [depositTypeFilter, setDepositTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    fetchInstitutions();
  }, []);

  useEffect(() => {
    fetchFDRs();
  }, [page, statusFilter, verificationFilter, institutionFilter, depositTypeFilter]);

  const fetchInstitutions = async () => {
    try {
      const res = await api.get('/institutions');
      setInstitutions(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFDRs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '15',
        ...(statusFilter && { status: statusFilter }),
        ...(verificationFilter && { verification_status: verificationFilter }),
        ...(institutionFilter && { institution_id: institutionFilter }),
        ...(depositTypeFilter && { deposit_type: depositTypeFilter }),
        ...(search && { search }),
      });

      const res = await api.get(`/fdrs?${params.toString()}`);
      setFdrs(res.data.data);
      setTotalPages(res.data.totalPages);
      setTotalRecords(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchFDRs();
  };

  const formatCurrency = (amt: number) => '₹' + amt.toLocaleString('en-IN');

  const exportCSV = () => {
    if (fdrs.length === 0) return;
    const headers = ['FDR Number', 'Institution', 'Bank', 'Deposit Amount', 'Issue Date', 'Maturity Date', 'Status', 'Verification'];
    const rows = fdrs.map((f) => [
      f.fdr_number,
      `"${f.institution_name}"`,
      `"${f.bank_name}"`,
      f.deposit_amount,
      f.issue_date,
      f.maturity_date,
      f.status,
      f.verification_status,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AICTE_FDR_Registry_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Security Deposit / FDR Repository</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Total of {totalRecords} financial instruments registered in regulatory compliance records
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export CSV</span>
          </button>

          {user?.role !== 'viewer' && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Register New FDR</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by FDR number, Institution name, or Bank..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
          >
            Search
          </button>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-100">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          >
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Expiring Soon">Expiring Soon (&lt;30d)</option>
            <option value="Matured">Matured</option>
            <option value="Renewed">Renewed</option>
            <option value="Released">Released</option>
            <option value="Pending Verification">Pending Verification</option>
          </select>

          <select
            value={verificationFilter}
            onChange={(e) => {
              setVerificationFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          >
            <option value="">All Verifications</option>
            <option value="Verified">Verified via Bank</option>
            <option value="Unverified">Unverified</option>
            <option value="Discrepancy">Discrepancy Flagged</option>
            <option value="Pending">Pending Scrutiny</option>
          </select>

          <select
            value={depositTypeFilter}
            onChange={(e) => {
              setDepositTypeFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          >
            <option value="">All Instrument Types</option>
            <option value="FDR">Fixed Deposit Receipt</option>
            <option value="Security Deposit">Security Deposit</option>
            <option value="Bank Guarantee">Bank Guarantee</option>
          </select>

          {user?.role !== 'institution_user' && (
            <select
              value={institutionFilter}
              onChange={(e) => {
                setInstitutionFilter(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 truncate"
            >
              <option value="">All Institutions</option>
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main FDR Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Instrument Reference</th>
                <th className="py-3 px-4">Technical Institution</th>
                <th className="py-3 px-4">Issuing Bank</th>
                <th className="py-3 px-4">Principal Amount</th>
                <th className="py-3 px-4">Validity / Maturity</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Scrutiny State</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-2"></div>
                    <p>Loading repository records...</p>
                  </td>
                </tr>
              ) : fdrs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <AlertCircle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-medium text-slate-600">No FDR instruments match the specified criteria.</p>
                    <p className="text-[11px] mt-0.5">Try adjusting your search keywords or filter values.</p>
                  </td>
                </tr>
              ) : (
                fdrs.map((fdr) => (
                  <tr key={fdr.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="py-3.5 px-4">
                      <Link to={`/fdrs/${fdr.id}`} className="font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1.5">
                        <span>{fdr.fdr_number}</span>
                        {fdr.is_renewal === 1 && (
                          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.2 rounded font-semibold">
                            REN
                          </span>
                        )}
                      </Link>
                      <span className="text-[10px] text-slate-400 block mt-0.5">{fdr.deposit_type}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-800 line-clamp-1">{fdr.institution_name}</p>
                      <span className="text-[10px] text-slate-400">{fdr.aicte_id}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      <span className="font-medium block">{fdr.bank_name}</span>
                      <span className="text-[11px] text-slate-400">{fdr.bank_branch || 'Branch N/A'}</span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {formatCurrency(fdr.deposit_amount)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-medium text-slate-700">{fdr.maturity_date}</span>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {fdr.days_to_maturity !== undefined && (
                          fdr.days_to_maturity < 0 ? (
                            <span className="text-rose-600 font-semibold">Matured {Math.abs(fdr.days_to_maturity)}d ago</span>
                          ) : fdr.days_to_maturity <= 30 ? (
                            <span className="text-amber-600 font-semibold">{fdr.days_to_maturity}d remaining</span>
                          ) : (
                            <span>{fdr.days_to_maturity}d remaining</span>
                          )
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge status={fdr.status} />
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge status={fdr.verification_status} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        to={`/fdrs/${fdr.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded text-xs font-semibold transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <p className="text-xs text-slate-500">
            Showing Page <span className="font-semibold text-slate-700">{page}</span> of{' '}
            <span className="font-semibold text-slate-700">{totalPages}</span> ({totalRecords} records)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="px-3 py-1 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Add FDR Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register New Security Deposit / FDR"
        maxWidth="2xl"
      >
        <FDRForm
          onSuccess={() => {
            setIsAddModalOpen(false);
            fetchFDRs();
          }}
          onCancel={() => setIsAddModalOpen(false)}
        />
      </Modal>
    </div>
  );
};
