import React from 'react';
import { Bell, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Link } from 'react-router-dom';

interface TopBarProps {
  title?: string;
}

export const TopBar: React.FC<TopBarProps> = ({ title = 'Portal' }) => {
  const { user } = useAuth();

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-30 shadow-sm">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
      </div>

      <div className="flex items-center gap-4">
        {/* Verification indicator */}
        <div className="hidden md:flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 px-3 py-1.5 rounded-full text-xs font-medium">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          <span>SAFE Engine • AICTE Regulation Bureau</span>
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
        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs uppercase shadow-sm">
            {user?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="hidden sm:block text-left text-xs">
            <span className="block font-semibold text-slate-700">{user?.full_name}</span>
            <span className="text-slate-400 capitalize">{user?.role?.replace('_', ' ')}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
