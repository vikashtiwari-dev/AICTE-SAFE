import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { Institution } from '../types';
import { Building2, Search, MapPin, Phone, Mail, IndianRupee, FileSpreadsheet, Plus } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../hooks/useAuth';

export const Institutions: React.FC = () => {
  const { user } = useAuth();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form state
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

  useEffect(() => {
    fetchInstitutions();
  }, []);

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
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = institutions.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.aicte_id.toLowerCase().includes(search.toLowerCase()) ||
      (i.city && i.city.toLowerCase().includes(search.toLowerCase())) ||
      (i.state && i.state.toLowerCase().includes(search.toLowerCase()))
  );

  const formatCurrency = (amt?: number) => '₹' + (amt || 0).toLocaleString('en-IN');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Technical Institutions Directory</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Overview of AICTE-approved colleges, universities and their active security deposit portfolios
          </p>
        </div>

        {user?.role === 'admin' && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Technical Institution</span>
          </button>
        )}
      </div>

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

      {/* Add Institution Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Register Technical Institution">
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
