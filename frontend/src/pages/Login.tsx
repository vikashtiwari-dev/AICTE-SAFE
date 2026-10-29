import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../api/client';
import {
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  RotateCw,
  Volume2,
  ArrowRight,
  Building2,
  KeyRound,
} from 'lucide-react';
import { InstitutionRequestModal } from '../components/InstitutionRequestModal';

type RoleTab = 'institution' | 'officer' | 'admin';

export const Login: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<RoleTab>('institution');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaCode, setCaptchaCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Generate a random 5-character alphanumeric captcha
  const generateCaptcha = () => {
    const chars = '23456789abcdefghkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaCode(code);
    setCaptchaInput('');
  };

  useEffect(() => {
    generateCaptcha();
  }, [selectedRole]);

  // When switching tabs, prefill default demo credentials for convenience
  const handleRoleChange = (role: RoleTab) => {
    setSelectedRole(role);
    setError('');
    if (role === 'institution') {
      setUsername('inst_user1');
      setPassword('inst123');
    } else if (role === 'officer') {
      setUsername('officer1');
      setPassword('officer123');
    } else {
      setUsername('admin');
      setPassword('admin123');
    }
  };

  // Set initial role values on mount
  useEffect(() => {
    setUsername('inst_user1');
    setPassword('inst123');
  }, []);

  const speakCaptcha = () => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(captchaCode.split('').join(' '));
      utterance.rate = 0.8;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Verify Captcha
    if (captchaInput.trim() !== captchaCode) {
      setError('Invalid security code. CAPTCHA is case-sensitive.');
      generateCaptcha();
      return;
    }

    setLoading(true);

    try {
      const res = await api.post('/auth/login', { username, password });
      login(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Authentication failed. Please verify credentials.');
      generateCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const getRoleButtonLabel = () => {
    if (selectedRole === 'institution') return 'Sign In as Institution';
    if (selectedRole === 'officer') return 'Sign In as Officer';
    return 'Sign In as Administrator';
  };

  return (
    <div className="min-h-screen bg-[#06070a] text-[#f1f5f9] flex flex-col justify-center items-center p-4 selection:bg-[#0071e3] selection:text-white relative overflow-hidden font-sans">
      {/* Background Glows (Capacity Connect Signature) */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-gradient-to-b from-[#0071e3]/15 via-[#2997ff]/5 to-transparent blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 left-1/3 w-[400px] h-[250px] bg-[#bf5af2]/5 blur-3xl pointer-events-none -z-10" />

      {/* Subtitle Header */}
      <div className="w-full max-w-[460px] text-center mb-4">
        <p className="text-xs font-medium text-slate-400">Secure role-based authentication</p>
      </div>

      {/* Main Glassmorphism Card */}
      <div className="w-full max-w-[460px] bg-[#0c0d14]/90 border border-white/10 rounded-3xl p-6 sm:p-7 shadow-[0_25px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl relative">
        {/* Role Tab Selector (Trainee / Trainer / Admin -> Institution / Officer / Admin) */}
        <div className="grid grid-cols-3 bg-[#06070a] p-1 rounded-2xl border border-white/5 mb-6">
          <button
            type="button"
            onClick={() => handleRoleChange('institution')}
            className={`py-2 px-3 text-xs font-semibold rounded-xl transition-all ${
              selectedRole === 'institution'
                ? 'bg-[#0071e3] text-white shadow-[0_0_15px_rgba(0,113,227,0.4)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Institution
          </button>
          <button
            type="button"
            onClick={() => handleRoleChange('officer')}
            className={`py-2 px-3 text-xs font-semibold rounded-xl transition-all ${
              selectedRole === 'officer'
                ? 'bg-[#0071e3] text-white shadow-[0_0_15px_rgba(0,113,227,0.4)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Officer
          </button>
          <button
            type="button"
            onClick={() => handleRoleChange('admin')}
            className={`py-2 px-3 text-xs font-semibold rounded-xl transition-all ${
              selectedRole === 'admin'
                ? 'bg-[#0071e3] text-white shadow-[0_0_15px_rgba(0,113,227,0.4)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Admin
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Official Username / Email */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Official Username / Login ID
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-white/10 bg-[#06070a] text-sm text-white focus:outline-hidden focus:ring-2 focus:ring-[#0071e3] focus:border-[#0071e3] transition-all font-sans placeholder:text-slate-600"
                placeholder={selectedRole === 'institution' ? 'inst_user1 or AICTE PID' : selectedRole === 'officer' ? 'officer1' : 'admin'}
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500">
                <KeyRound className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-300">Password</label>
              <a
                href="mailto:aictesafe.org@gmail.com?subject=Password%20Reset%20Request"
                className="text-xs font-medium text-[#2997ff] hover:underline"
              >
                Forgot Password?
              </a>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-white/10 bg-[#06070a] text-sm text-white focus:outline-hidden focus:ring-2 focus:ring-[#0071e3] focus:border-[#0071e3] transition-all font-sans placeholder:text-slate-600"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* CAPTCHA Box */}
          <div className="p-3.5 rounded-2xl bg-[#06070a] border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                <ShieldCheck className="w-4 h-4 text-[#2997ff]" />
                <span>CAPTCHA</span>
              </div>
              <span className="text-[10px] text-slate-500">Case-sensitive</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Visual Distorted Code Badge */}
              <div
                className="h-10 px-4 rounded-xl bg-gradient-to-r from-slate-950 via-slate-900 to-black border border-white/15 flex items-center justify-center font-mono text-base font-bold tracking-[0.25em] select-none text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-400 to-amber-300 relative overflow-hidden shrink-0 shadow-inner"
                style={{ textShadow: '0 0 10px rgba(0,255,255,0.3)' }}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:6px_6px] pointer-events-none opacity-40"></div>
                {captchaCode}
              </div>

              {/* Refresh button */}
              <button
                type="button"
                onClick={generateCaptcha}
                title="Regenerate CAPTCHA"
                className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors shrink-0"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Audio button */}
              <button
                type="button"
                onClick={speakCaptcha}
                title="Audio CAPTCHA"
                className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors shrink-0"
              >
                <Volume2 className="w-4 h-4" />
              </button>

              {/* Captcha Input */}
              <input
                type="text"
                required
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value)}
                placeholder="Enter code"
                className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-white/10 bg-[#0c0d14] text-xs font-mono text-white placeholder:text-slate-600 focus:outline-hidden focus:ring-1 focus:ring-[#0071e3] focus:border-[#0071e3] transition-all"
              />
            </div>
          </div>

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-[#0071e3] hover:bg-[#2997ff] text-white font-semibold rounded-2xl text-sm transition-all shadow-[0_0_20px_rgba(0,113,227,0.4)] hover:shadow-[0_0_25px_rgba(0,113,227,0.6)] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>{getRoleButtonLabel()}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Institutional Onboarding Link */}
        <div className="mt-5 pt-4 border-t border-white/10 text-center">
          <button
            type="button"
            onClick={() => setIsOnboardingModalOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-[#2997ff] transition-colors"
          >
            <Building2 className="w-3.5 h-3.5 text-[#2997ff]" />
            <span>New Institution? Submit Onboarding Request</span>
          </button>
        </div>
      </div>

      {/* Footer Support Info */}
      <div className="mt-6 text-center space-y-1 text-xs text-slate-500">
        <p>AICTE SAFE • Centralized Fixed Deposit & Joint-Lien Portal</p>
        <p className="flex items-center justify-center gap-1.5">
          <span>Official Support:</span>
          <a
            href="mailto:aictesafe.org@gmail.com"
            className="text-[#2997ff] hover:underline"
          >
            aictesafe.org@gmail.com
          </a>
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
