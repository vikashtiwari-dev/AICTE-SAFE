import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
  Award,
  RefreshCw,
  Landmark,
  Scale,
  Mail,
  ChevronRight,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Wifi,
} from 'lucide-react';
import { InstitutionRequestModal } from '../components/InstitutionRequestModal';

export const Landing: React.FC = () => {
  const { user } = useAuth();

  // Zoom feature state (80% to 140%)
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 10, 140));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 10, 80));
  };

  const handleResetZoom = () => {
    setZoomLevel(100);
  };

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
    <div className="min-h-screen bg-[#06070a] text-[#f1f5f9] flex flex-col font-sans selection:bg-[#0071e3] selection:text-white relative overflow-hidden">
      {/* Background Glow Orbs in Capacity-Connect Style */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-gradient-to-b from-[#0071e3]/15 via-[#2997ff]/5 to-transparent blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-[600px] left-1/4 w-[500px] h-[300px] bg-[#bf5af2]/5 blur-3xl pointer-events-none -z-10" />

      {/* 2. Sleek Glassmorphism Header */}
      <header className="sticky top-0 z-40 bg-[#06070a]/80 backdrop-blur-md border-b border-white/10">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo & Bureau Titles (Pressed to Left-Most Side) */}
          <div className="flex items-center gap-3.5">
            <div>
              <span className="text-xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#2997ff] via-[#38bdf8] to-[#c084fc] block">
                AICTE SAFE
              </span>
              <p className="text-xs text-slate-400 font-medium">All India Council for Technical Education</p>
            </div>
          </div>

          {/* Navigation & Portal Entry Actions */}
          <div className="flex items-center gap-3">
            {/* Interactive Zoom Control Widget (Exact Match to Capacity Connect) */}
            <div className="flex items-center bg-black/60 border border-white/15 rounded-full p-0.5 shadow-inner">
              <button
                onClick={handleZoomOut}
                disabled={zoomLevel <= 80}
                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors rounded-full hover:bg-white/10"
                title="Zoom Out"
                aria-label="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handleResetZoom}
                className="px-2 text-xs font-mono font-semibold text-slate-200 hover:text-[#2997ff] transition-colors select-none"
                title="Click to reset to 100%"
              >
                {zoomLevel}%
              </button>

              <button
                onClick={handleZoomIn}
                disabled={zoomLevel >= 140}
                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors rounded-full hover:bg-white/10"
                title="Zoom In"
                aria-label="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={() => setIsOnboardingModalOpen(true)}
              className="hidden lg:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-300 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/10 hover:border-white/20"
            >
              <Building2 className="w-4 h-4 text-[#2997ff]" />
              <span>Onboarding</span>
            </button>

            {user ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#0071e3] hover:bg-[#2997ff] rounded-xl shadow-[0_0_20px_rgba(0,113,227,0.4)] transition-all hover:scale-[1.02]"
              >
                <span>Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-[#0071e3] hover:bg-[#2997ff] rounded-xl shadow-[0_0_20px_rgba(0,113,227,0.4)] transition-all hover:scale-[1.02]"
              >
                <span>Sign In</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Zoomable Content Canvas */}
      <main
        style={{
          zoom: `${zoomLevel}%`,
          transformOrigin: 'top center',
          transition: 'zoom 0.15s ease-out'
        }}
        className="flex-1 flex flex-col"
      >

      {/* 3. Hero Section */}
      <section className="py-20 px-4 sm:px-8 relative">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="relative inline-block">
            {/* Ambient backlight glow directly behind heading */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0071e3]/30 via-[#a855f7]/30 to-[#ec4899]/30 blur-2xl -z-10 rounded-full scale-110 pointer-events-none" />
            <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tight leading-[1.08] text-transparent bg-clip-text bg-gradient-to-r from-[#2997ff] via-[#38bdf8] via-[#a855f7] to-[#f43f5e] drop-shadow-[0_10px_25px_rgba(0,113,227,0.3)] select-none">
              AICTE SAFE
            </h1>
          </div>

          <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            AICTE-SAFE protects student and regulatory interests through automated tripartite verification of institutional security deposits with Scheduled Commercial Banks, SFMS messaging, and tamper-evident digital release certifications.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <a
              href="#verification"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold text-white bg-[#0071e3] hover:bg-[#2997ff] rounded-xl shadow-[0_0_25px_rgba(0,113,227,0.5)] transition-all hover:scale-[1.02]"
            >
              <Search className="w-4 h-4" />
              <span>Public FDR / PID Verification</span>
            </a>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all hover:border-white/25"
            >
              <Lock className="w-4 h-4 text-[#2997ff]" />
              <span>Authorized Official Access</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Public Instrument Verification Widget */}
      <section id="verification" className="py-14 px-4 sm:px-8 max-w-4xl mx-auto w-full">
        <div className="bg-[#0e1017]/90 rounded-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.6)] p-6 sm:p-8 backdrop-blur-xl relative">
          <div className="text-center max-w-xl mx-auto mb-6">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#0071e3]/10 text-[#2997ff] border border-[#0071e3]/20 mb-2">
              <Search className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-white">Public Instrument & Lien Status Search</h2>
            <p className="text-xs text-slate-400 mt-1">
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
                placeholder="Permanent Institute ID"
                className="w-full px-4 py-3 rounded-xl border border-white/10 bg-[#06070a] text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-[#0071e3] focus:border-[#0071e3] transition-all font-mono placeholder:text-slate-500"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#0071e3] to-[#2997ff] hover:opacity-90 text-white text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 shrink-0 shadow-[0_0_20px_rgba(0,113,227,0.3)]"
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
            <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 max-w-2xl mx-auto">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{searchError}</span>
            </div>
          )}

          {/* Search Result Card */}
          {searchResult && (
            <div className="mt-6 p-6 rounded-xl bg-[#141824]/80 border border-white/10 max-w-2xl mx-auto backdrop-blur-md">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4 mb-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#2997ff]">
                    Verified Statutory Instrument
                  </span>
                  <h3 className="text-lg font-bold text-white">{searchResult.institution_name}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    AICTE PID: {searchResult.aicte_id} • {searchResult.location}
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 border ${
                  searchResult.verification_status === 'BANK_CONFIRMED'
                    ? 'bg-[#30d158]/15 text-[#30d158] border-[#30d158]/30'
                    : 'bg-[#ff9f0a]/15 text-[#ff9f0a] border-[#ff9f0a]/30'
                }`}>
                  {searchResult.verification_status}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">FDR Instrument No:</span>
                  <span className="font-mono font-semibold text-slate-200">{searchResult.fdr_number_masked}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Issuing Depository:</span>
                  <span className="font-semibold text-slate-200">{searchResult.bank_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Joint-Lien Status:</span>
                  <span className={`font-semibold inline-flex items-center gap-1 ${
                    searchResult.has_joint_lien ? 'text-[#30d158]' : 'text-[#ff9f0a]'
                  }`}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {searchResult.has_joint_lien ? 'AICTE Lien Marked' : 'Pending Formal Deed'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Issue Date:</span>
                  <span className="font-semibold text-slate-300">{new Date(searchResult.issue_date).toLocaleDateString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Maturity Date:</span>
                  <span className="font-semibold text-slate-300">{new Date(searchResult.maturity_date).toLocaleDateString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Deposit Category:</span>
                  <span className="font-semibold text-slate-300">{searchResult.deposit_type}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 5. Statutory Regulatory Framework & APH Highlights */}
      <section id="aph" className="py-16 bg-[#090b10] border-y border-white/5 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-bold text-[#2997ff] uppercase tracking-wider">Mandatory Compliance</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">Approval Process Handbook (APH) Provisions</h2>
            <p className="text-xs text-slate-400 mt-1">
              Regulations governing security deposit custody, lock-in terms, and premature encashment safeguards.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-[#0e1017] border border-white/10 hover:border-[#0071e3]/40 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-[#0071e3]/10 text-[#2997ff] flex items-center justify-center mb-4 border border-[#0071e3]/20">
                <Landmark className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-2 group-hover:text-[#2997ff] transition-colors">Chapter I: New Establishment</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Mandatory FDR creation in joint name with AICTE for establishing technical institutions. Lock-in period of 8–10 years strictly enforced to safeguard student and faculty interests.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0e1017] border border-white/10 hover:border-[#30d158]/40 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-[#30d158]/10 text-[#30d158] flex items-center justify-center mb-4 border border-[#30d158]/20">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-2 group-hover:text-[#30d158] transition-colors">Format 1: Joint-Lien Deed</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Depository bank branch must register AICTE lien on core banking records. Premature liquidation without written council authorization constitutes a statutory banking violation.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0e1017] border border-white/10 hover:border-[#bf5af2]/40 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-[#bf5af2]/10 text-[#bf5af2] flex items-center justify-center mb-4 border border-[#bf5af2]/20">
                <Award className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-2 group-hover:text-[#bf5af2] transition-colors">Digital NOC & Release</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Upon successful fulfillment of all regulatory conditions, AICTE generates a digitally signed, QR-verifiable No-Objection Release Certificate for the bank branch manager.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Three-Party Operational Workflow */}
      <section className="py-16 px-4 sm:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs font-bold text-[#2997ff] uppercase tracking-wider">Automated Lifecycle</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">Tripartite Verification Workflow</h2>
          <p className="text-xs text-slate-400 mt-1">
            End-to-end transparency connecting Institutions, Depository Banks, and Council Bureaus.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 bg-[#0e1017] rounded-xl border border-white/10 text-center space-y-2 hover:border-[#0071e3]/40 transition-all">
            <span className="w-8 h-8 rounded-full bg-[#0071e3]/20 text-[#2997ff] font-bold text-xs inline-flex items-center justify-center border border-[#0071e3]/30">1</span>
            <h4 className="font-bold text-sm text-white">FDR Submission</h4>
            <p className="text-xs text-slate-400 leading-normal">
              College creates FDR in joint name and uploads scanned copy with signed Format 1 undertaking.
            </p>
          </div>

          <div className="p-5 bg-[#0e1017] rounded-xl border border-white/10 text-center space-y-2 hover:border-[#0071e3]/40 transition-all">
            <span className="w-8 h-8 rounded-full bg-[#0071e3]/20 text-[#2997ff] font-bold text-xs inline-flex items-center justify-center border border-[#0071e3]/30">2</span>
            <h4 className="font-bold text-sm text-white">OCR & SFMS Check</h4>
            <p className="text-xs text-slate-400 leading-normal">
              Automated OCR extracts document tokens, while banking API cross-verifies IFSC and branch authenticity.
            </p>
          </div>

          <div className="p-5 bg-[#0e1017] rounded-xl border border-white/10 text-center space-y-2 hover:border-[#0071e3]/40 transition-all">
            <span className="w-8 h-8 rounded-full bg-[#0071e3]/20 text-[#2997ff] font-bold text-xs inline-flex items-center justify-center border border-[#0071e3]/30">3</span>
            <h4 className="font-bold text-sm text-white">Daily Cron Audit</h4>
            <p className="text-xs text-slate-400 leading-normal">
              Automated scheduler continuously tracks maturity at T-90, 60, 30 days and calculates institutional health scores.
            </p>
          </div>

          <div className="p-5 bg-[#0e1017] rounded-xl border border-white/10 text-center space-y-2 hover:border-[#0071e3]/40 transition-all">
            <span className="w-8 h-8 rounded-full bg-[#0071e3]/20 text-[#2997ff] font-bold text-xs inline-flex items-center justify-center border border-[#0071e3]/30">4</span>
            <h4 className="font-bold text-sm text-white">Digital NOC Release</h4>
            <p className="text-xs text-slate-400 leading-normal">
              Bureau scrutiny clears release upon term completion; generates tamper-proof QR certificate for bank discharge.
            </p>
          </div>
        </div>
      </section>

      {/* 7. Footer */}
      <footer id="helpdesk" className="bg-[#0b0b0d] text-slate-400 text-xs border-t border-white/10 py-12 px-4 sm:px-8 mt-auto">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-white font-bold text-sm">AICTE SAFE PORTAL</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Official regulatory portal of the All India Council for Technical Education, Ministry of Education, Government of India.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold text-xs mb-3 uppercase tracking-wider">Address</h4>
            <p className="text-slate-400 text-xs leading-relaxed">
              Guru Gobind Singh Indraprastha University<br />
              East Delhi Campus, Near Surajmal Vihar<br />
              New Delhi - 110032
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold text-xs mb-3 uppercase tracking-wider">Official Helpdesk & Inquiries</h4>
            <p className="text-slate-400 text-xs leading-relaxed flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 text-[#2997ff] shrink-0" />
              <a href="mailto:aictesafe.org@gmail.com" className="text-[#2997ff] hover:underline">
                aictesafe.org@gmail.com
              </a>
            </p>
            <p className="text-[11px] text-slate-500">
              For onboarding assistance, technical discrepancies, or lien certificate verification support.
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px]">
          <p>© {new Date().getFullYear()} All India Council for Technical Education (AICTE). All Rights Reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/login" className="hover:text-white transition-colors">Portal Sign In</Link>
            <button onClick={() => setIsOnboardingModalOpen(true)} className="hover:text-white transition-colors">
              New Institution Registration
            </button>
          </div>
        </div>
      </footer>
      </main>

      {/* Onboarding Modal */}
      <InstitutionRequestModal
        isOpen={isOnboardingModalOpen}
        onClose={() => setIsOnboardingModalOpen(false)}
      />
    </div>
  );
};
