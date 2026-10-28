import React from 'react';
import { Bell, ShieldCheck, Languages, Menu } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import { Link } from 'react-router-dom';

interface TopBarProps {
  title?: string;
  onToggleSidebar?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ title = 'Portal', onToggleSidebar }) => {
  const { user } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Mobile menu trigger */}
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <h2 className="text-base sm:text-lg lg:text-xl font-bold text-slate-800 truncate">{title}</h2>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {/* Language Switcher (GIGW Compliant: English / Hindi) */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setLanguage('en')}
            className={`px-2 sm:px-2.5 py-1 rounded transition-colors ${
              language === 'en'
                ? 'bg-white text-blue-700 shadow-2xs font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            EN
          </button>
          <button
            onClick={() => setLanguage('hi')}
            className={`px-2 sm:px-2.5 py-1 rounded transition-colors ${
              language === 'hi'
                ? 'bg-blue-600 text-white shadow-2xs font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            हि
          </button>
        </div>

        {/* Verification indicator */}
        <div className="hidden xl:flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 px-3 py-1.5 rounded-full text-xs font-medium">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="truncate">{language === 'hi' ? 'सेफ इंजन • विनियमन ब्यूरो' : 'SAFE Engine • AICTE Regulation Bureau'}</span>
        </div>

        {/* Alerts Bell */}
        <Link
          to="/alerts"
          className="relative p-2 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-full transition-colors"
          title="View Alerts"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white"></span>
        </Link>

        {/* User Pill */}
        <div className="flex items-center gap-2 sm:gap-2.5 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs uppercase shadow-xs shrink-0">
            {user?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="hidden md:block text-left text-xs max-w-[130px] truncate">
            <span className="block font-semibold text-slate-700 truncate">{user?.full_name}</span>
            <span className="text-slate-400 capitalize truncate">{user?.role?.replace('_', ' ')}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
