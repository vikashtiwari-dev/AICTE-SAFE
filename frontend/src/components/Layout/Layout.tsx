import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export const Layout: React.FC = () => {
  const location = useLocation();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.startsWith('/dashboard')) return 'Executive Dashboard';
    if (path.startsWith('/fdrs/')) return 'FDR Instrument Details';
    if (path.startsWith('/fdrs')) return 'Security Deposit / FDR Repository';
    if (path.startsWith('/institutions')) return 'Technical Institutions Directory';
    if (path.startsWith('/alerts')) return 'Maturity & Compliance Alerts';
    if (path.startsWith('/releases')) return 'Release & Refund Workflow';
    if (path.startsWith('/reports')) return 'Regulatory Audit & Analytics';
    return 'AICTE SAFE Engine';
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={getPageTitle()} />
        <main className="flex-1 p-8 overflow-y-auto">
          <Outlet />
        </main>
        <footer className="bg-white border-t border-slate-200 px-8 py-3 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>AICTE SAFE • Fixed Deposit Receipt (FDR) & Joint-Lien Portal</span>
          <div className="flex items-center gap-1.5">
            <span>Official Helpdesk:</span>
            <a
              href="mailto:aictesafe.org@gmail.com"
              className="font-medium text-blue-600 hover:text-blue-800 underline transition-colors"
            >
              aictesafe.org@gmail.com
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
};
