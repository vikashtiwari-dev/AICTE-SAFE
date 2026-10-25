import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../api/client';
import { ShieldCheck, Lock, User as UserIcon, AlertCircle, Building2 } from 'lucide-react';
import { InstitutionRequestModal } from '../components/InstitutionRequestModal';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/login', { username, password });
      login(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 selection:bg-blue-500 selection:text-white">
      {/* Background Decor */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white shadow-lg mb-4 ring-8 ring-blue-600/20">
            <ShieldCheck className="w-9 h-9" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">AICTE-SAFE</h1>
          <p className="text-blue-400 font-semibold text-xs tracking-wider uppercase mt-1">
            Secure Automated FDR & Deposit Engine
          </p>
          <p className="text-slate-400 text-xs mt-1">Regulation Bureau, Ministry of Education, Govt. of India</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-1">Portal Sign In</h2>
          <p className="text-slate-500 text-xs mb-6">Enter authorized credentials to access repository</p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Username / AICTE Login ID</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-colors"
                  placeholder="Enter login username"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors shadow-md hover:shadow-lg disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Sign In to Portal'}
            </button>
          </form>

          {/* Onboarding Request CTA */}
          <div className="mt-4 pt-4 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={() => setIsOnboardingModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>New Institution? Submit Onboarding Request</span>
            </button>
          </div>

          {/* Demo Credentials Pill Selectors */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3 text-center">
              Quick Demo Personas
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleDemoFill('admin', 'admin123')}
                className="p-2 border border-slate-200 rounded-lg text-left hover:border-blue-500 hover:bg-blue-50/50 transition-colors group"
              >
                <div className="font-semibold text-slate-800 group-hover:text-blue-600">Administrator</div>
                <div className="text-[10px] text-slate-400">admin / admin123</div>
              </button>
              <button
                type="button"
                onClick={() => handleDemoFill('officer1', 'officer123')}
                className="p-2 border border-slate-200 rounded-lg text-left hover:border-blue-500 hover:bg-blue-50/50 transition-colors group"
              >
                <div className="font-semibold text-slate-800 group-hover:text-blue-600">Bureau Officer</div>
                <div className="text-[10px] text-slate-400">officer1 / officer123</div>
              </button>
              <button
                type="button"
                onClick={() => handleDemoFill('inst_user1', 'inst123')}
                className="p-2 border border-slate-200 rounded-lg text-left hover:border-blue-500 hover:bg-blue-50/50 transition-colors group"
              >
                <div className="font-semibold text-slate-800 group-hover:text-blue-600">Institution User</div>
                <div className="text-[10px] text-slate-400">inst_user1 / inst123</div>
              </button>
              <button
                type="button"
                onClick={() => handleDemoFill('viewer1', 'viewer123')}
                className="p-2 border border-slate-200 rounded-lg text-left hover:border-blue-500 hover:bg-blue-50/50 transition-colors group"
              >
                <div className="font-semibold text-slate-800 group-hover:text-blue-600">Audit Viewer</div>
                <div className="text-[10px] text-slate-400">viewer1 / viewer123</div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-6">
          Official Portal • All India Council for Technical Education, Ministry of Education, Govt. of India
        </p>
      </div>

      {/* Onboarding Modal */}
      <InstitutionRequestModal
        isOpen={isOnboardingModalOpen}
        onClose={() => setIsOnboardingModalOpen(false)}
      />
    </div>
  );
};
