import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={getPageTitle()} onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />
        <main className="flex-1 p-3 sm:p-5 lg:p-8 overflow-y-auto w-full max-w-7xl mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
