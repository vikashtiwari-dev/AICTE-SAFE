import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileSpreadsheet,
  Building2,
  AlertTriangle,
  ArrowUpRightFromCircle,
  FileBarChart,
  LogOut,
  ShieldCheck,
  Gavel,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../context/LanguageContext';

export const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const { t, language } = useLanguage();

  const navItems = [
    { label: t('dashboard'), path: '/dashboard', icon: LayoutDashboard },
    { label: t('fdr_repository'), path: '/fdrs', icon: FileSpreadsheet },
    { label: t('institutions'), path: '/institutions', icon: Building2 },
    { label: t('alerts_validity'), path: '/alerts', icon: AlertTriangle },
    { label: t('release_requests'), path: '/releases', icon: ArrowUpRightFromCircle },
    { label: language === 'hi' ? 'जब्ती एवं मांग आदेश' : 'Lien Invocations', path: '/invocations', icon: Gavel },
    { label: t('reports_audits'), path: '/reports', icon: FileBarChart },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col shrink-0 h-screen sticky top-0">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center gap-3 bg-slate-950">
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white tracking-wide">AICTE SAFE</h1>
          <p className="text-[10px] text-blue-400 font-semibold tracking-wider uppercase">
            {language === 'hi' ? 'एफडीआर एवं जमा इंजन' : 'FDR & Deposit Engine'}
          </p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
          {t('menu')}
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Contact & Support */}
      <div className="px-4 py-3 border-t border-slate-800/80 bg-slate-950/40 text-[11px] text-slate-400">
        <p className="font-semibold text-slate-300 mb-0.5">Need Assistance?</p>
        <p className="text-[10px] text-slate-400">Helpdesk & Support:</p>
        <a
          href="mailto:aictesafe.org@gmail.com"
          className="text-blue-400 hover:text-blue-300 font-mono text-[10px] break-all block mt-0.5 hover:underline"
        >
          aictesafe.org@gmail.com
        </a>
      </div>

      {/* User profile & Logout */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/60">
        <div className="flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <p className="text-sm font-semibold text-white truncate">{user?.full_name}</p>
            <p className="text-xs text-blue-400 capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
          <button
            onClick={logout}
            title="Sign Out"
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
