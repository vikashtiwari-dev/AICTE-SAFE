import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../api/client';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  AlertCircle,
  Building2,
  FileCheck2,
  Lock,
  ArrowRight,
  ExternalLink,
  BookOpen,
  Award,
  RefreshCw,
  Landmark,
  Scale,
  PhoneCall,
  Mail,
  HelpCircle,
  ChevronRight,
} from 'lucide-react';
import { InstitutionRequestModal } from '../components/InstitutionRequestModal';

export const Landing: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState('');
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchError('');
    setSearchResult(null);

    try {
      const res = await api.get(`/fdrs/public-verify?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchResult(res.data.data);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setSearchError('No matching record found. Please verify the FDR Number or AICTE Institute ID.');
      } else {
        setSearchError(err.response?.data?.error || 'Verification inquiry service temporarily unavailable.');
      }
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* 1. National Top Banner (GIGW Compliant) */}
      <div className="bg-slate-900 text-slate-300 text-xs py-1.5 px-4 sm:px-8 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-semibold text-white">भारत सरकार | Government of India</span>
            </span>
            <span className="hidden md:inline text-slate-500">•</span>
            <span className="hidden md:inline text-slate-400">शिक्षा मंत्रालय (Ministry of Education)</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <a href="#verification" className="hover:text-white transition-colors">Public Verification</a>
            <a href="#aph" className="hover:text-white transition-colors">APH Mandate</a>
            <a href="#helpdesk" className="hover:text-white transition-colors">Helpdesk</a>
          </div>
        </div>
      </div>

      {/* 2. Institutional Masthead Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-20 flex items-center justify-between">
          {/* Logo & Bureau Titles */}
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-[#003366] text-white flex items-center justify-center shadow-md border border-[#002244] shrink-0">
              <ShieldCheck className="w-7 h-7 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tracking-tight text-[#003366]">AICTE SAFE</span>
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-300">
                  NATIONAL PORTAL
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-700">अखिल भारतीय तकनीकी शिक्षा परिषद</p>
              <p className="text-[11px] text-slate-500">Bureau of Approval • Fixed Deposit Receipt & Joint-Lien Portal</p>
            </div>
          </div>

          {/* Navigation & Portal Entry Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsOnboardingModalOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-300"
            >
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>Institute Onboarding</span>
            </button>

            {user ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-all"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#003366] hover:bg-[#002244] rounded-lg shadow-sm transition-all"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Portal Sign In</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* 3. Hero Section */}
      <section className="bg-gradient-to-b from-blue-50/60 via-white to-slate-50 border-b border-slate-200 py-16 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-blue-100/80 border border-blue-200 text-blue-900 px-3.5 py-1.5 rounded-full text-xs font-semibold">
            <Scale className="w-4 h-4 text-blue-700" />
            <span>Statutory Deposit Custodian • Approval Process Handbook (APH 2024–27)</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Centralized Fixed Deposit & <br />
            <span className="text-[#003366]">Joint-Lien Monitoring Engine</span>
          </h1>

          <p className="text-slate-600 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            AICTE-SAFE protects student and regulatory interests through automated tripartite verification of institutional security deposits with Scheduled Commercial Banks, SFMS messaging, and tamper-evident digital release certifications.
          </p>

          {/* Quick CTA row */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <a
              href="#verification"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all"
            >
              <Search className="w-4 h-4" />
              <span>Public FDR / PID Verification</span>
            </a>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-xs transition-all"
            >
              <Lock className="w-4 h-4 text-slate-500" />
              <span>Authorized Official Access</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Public Instrument Verification Widget */}
      <section id="verification" className="py-14 px-4 sm:px-8 max-w-5xl mx-auto w-full">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 sm:p-8">
          <div className="text-center max-w-xl mx-auto mb-6">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 text-blue-700 mb-2">
              <Search className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Public Instrument & Lien Status Search</h2>
            <p className="text-xs text-slate-500 mt-1">
              Verify statutory deposit authenticity, AICTE joint-lien marking, and validity period directly against registry records.
            </p>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter FDR Number (e.g. FDR-2024-001) or AICTE PID (e.g. 1-10961234)"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-slate-50 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-6 py-3 rounded-xl bg-[#003366] hover:bg-[#002244] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shrink-0"
            >
              {searching ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Verify Status</span>
                </>
              )}
            </button>
          </form>

          {/* Search Error */}
          {searchError && (
            <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2 max-w-2xl mx-auto">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{searchError}</span>
            </div>
          )}

          {/* Search Result Card */}
          {searchResult && (
            <div className="mt-6 p-6 rounded-xl bg-gradient-to-br from-slate-50 to-blue-50/40 border border-blue-200 max-w-2xl mx-auto shadow-xs">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 mb-4">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Verified Statutory Instrument
                  </span>
                  <h3 className="text-lg font-bold text-slate-900">{searchResult.institution_name}</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    AICTE PID: {searchResult.aicte_id} • {searchResult.location}
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 border ${
                  searchResult.verification_status === 'BANK_CONFIRMED'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border-amber-300'
                }`}>
                  {searchResult.verification_status}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block">FDR Instrument No:</span>
                  <span className="font-mono font-semibold text-slate-800">{searchResult.fdr_number_masked}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Issuing Depository:</span>
                  <span className="font-semibold text-slate-800">{searchResult.bank_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Joint-Lien Status:</span>
                  <span className={`font-semibold inline-flex items-center gap-1 ${
                    searchResult.has_joint_lien ? 'text-emerald-700' : 'text-amber-700'
                  }`}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {searchResult.has_joint_lien ? 'AICTE Lien Marked' : 'Pending Formal Deed'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Issue Date:</span>
                  <span className="font-semibold text-slate-700">{new Date(searchResult.issue_date).toLocaleDateString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Maturity Date:</span>
                  <span className="font-semibold text-slate-700">{new Date(searchResult.maturity_date).toLocaleDateString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Deposit Category:</span>
                  <span className="font-semibold text-slate-700">{searchResult.deposit_type}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 5. Statutory Regulatory Framework & APH Highlights */}
      <section id="aph" className="py-14 bg-white border-y border-slate-200 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Mandatory Compliance</span>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">Approval Process Handbook (APH) Provisions</h2>
            <p className="text-xs text-slate-500 mt-1">
              Regulations governing security deposit custody, lock-in terms, and premature encashment safeguards.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-4">
                <Landmark className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Chapter I: New Establishment</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Mandatory FDR creation in joint name with AICTE for establishing technical institutions. Lock-in period of 8–10 years strictly enforced to safeguard student and faculty interests.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Format 1: Joint-Lien Deed</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Depository bank branch must register AICTE lien on core banking records. Premature liquidation without written council authorization constitutes a statutory banking violation.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-4">
                <Award className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Digital NOC & Release</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Upon successful fulfillment of all regulatory conditions, AICTE generates a digitally signed, QR-verifiable No-Objection Release Certificate for the bank branch manager.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Three-Party Operational Workflow */}
      <section className="py-14 px-4 sm:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Automated Lifecycle</span>
          <h2 className="text-2xl font-bold text-slate-900 mt-1">Tripartite Verification Workflow</h2>
          <p className="text-xs text-slate-500 mt-1">
            End-to-end transparency connecting Institutions, Depository Banks, and Council Bureaus.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 bg-white rounded-xl border border-slate-200 text-center space-y-2">
            <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-bold text-xs inline-flex items-center justify-center">1</span>
            <h4 className="font-bold text-sm text-slate-800">FDR Submission</h4>
            <p className="text-xs text-slate-500 leading-normal">
              College creates FDR in joint name and uploads scanned copy with signed Format 1 undertaking.
            </p>
          </div>

          <div className="p-5 bg-white rounded-xl border border-slate-200 text-center space-y-2">
            <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-bold text-xs inline-flex items-center justify-center">2</span>
            <h4 className="font-bold text-sm text-slate-800">OCR & SFMS Check</h4>
            <p className="text-xs text-slate-500 leading-normal">
              Automated OCR extracts document tokens, while banking API cross-verifies IFSC and branch authenticity.
            </p>
          </div>

          <div className="p-5 bg-white rounded-xl border border-slate-200 text-center space-y-2">
            <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-bold text-xs inline-flex items-center justify-center">3</span>
            <h4 className="font-bold text-sm text-slate-800">Daily Cron Audit</h4>
            <p className="text-xs text-slate-500 leading-normal">
              Automated scheduler continuously tracks maturity at T-90, 60, 30 days and calculates institutional health scores.
            </p>
          </div>

          <div className="p-5 bg-white rounded-xl border border-slate-200 text-center space-y-2">
            <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-bold text-xs inline-flex items-center justify-center">4</span>
            <h4 className="font-bold text-sm text-slate-800">Digital NOC Release</h4>
            <p className="text-xs text-slate-500 leading-normal">
              Bureau scrutiny clears release upon term completion; generates tamper-proof QR certificate for bank discharge.
            </p>
          </div>
        </div>
      </section>

      {/* 7. Institutional Helpdesk & Footer */}
      <footer id="helpdesk" className="bg-slate-900 text-slate-400 text-xs border-t border-slate-800 py-12 px-4 sm:px-8 mt-auto">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              <span className="text-white font-bold text-sm">AICTE SAFE PORTAL</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Official regulatory portal of the All India Council for Technical Education, Ministry of Education, Government of India.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold text-xs mb-3 uppercase tracking-wider">Statutory Bureau</h4>
            <p className="text-slate-400 text-xs leading-relaxed">
              Bureau of Approval, AICTE Headquarters<br />
              Nelson Mandela Marg, Vasant Kunj<br />
              New Delhi - 110070
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold text-xs mb-3 uppercase tracking-wider">Official Helpdesk & Inquiries</h4>
            <p className="text-slate-400 text-xs leading-relaxed flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 text-blue-400 shrink-0" />
              <a href="mailto:aictesafe.org@gmail.com" className="text-blue-400 hover:underline">
                aictesafe.org@gmail.com
              </a>
            </p>
            <p className="text-[11px] text-slate-500">
              For onboarding assistance, technical discrepancies, or lien certificate verification support.
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px]">
          <p>© {new Date().getFullYear()} All India Council for Technical Education (AICTE). All Rights Reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/login" className="hover:text-white transition-colors">Portal Sign In</Link>
            <button onClick={() => setIsOnboardingModalOpen(true)} className="hover:text-white transition-colors">
              New Institution Registration
            </button>
          </div>
        </div>
      </footer>

      {/* Onboarding Modal */}
      <InstitutionRequestModal
        isOpen={isOnboardingModalOpen}
        onClose={() => setIsOnboardingModalOpen(false)}
      />
    </div>
  );
};
