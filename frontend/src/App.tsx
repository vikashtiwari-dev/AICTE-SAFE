import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { LanguageProvider } from './context/LanguageContext';
import { Layout } from './components/Layout/Layout';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { FDRList } from './pages/FDRList';
import { FDRDetail } from './pages/FDRDetail';
import { Institutions } from './pages/Institutions';
import { Alerts } from './pages/Alerts';
import { Releases } from './pages/Releases';
import { Reports } from './pages/Reports';
import { Invocations } from './pages/Invocations';

const queryClient = new QueryClient();

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Front Door Landing Page */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />

              {/* Protected Institutional & Regulatory Portal */}
              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/app/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="fdrs" element={<FDRList />} />
                <Route path="fdrs/:id" element={<FDRDetail />} />
                <Route path="institutions" element={<Institutions />} />
                <Route path="institutions/:id" element={<Institutions />} />
                <Route path="alerts" element={<Alerts />} />
                <Route path="releases" element={<Releases />} />
                <Route path="invocations" element={<Invocations />} />
                <Route path="reports" element={<Reports />} />
              </Route>

              {/* Backward compatibility redirects for direct legacy paths */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
              </Route>

              <Route
                path="/fdrs"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<FDRList />} />
                <Route path=":id" element={<FDRDetail />} />
              </Route>

              <Route
                path="/institutions"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Institutions />} />
                <Route path=":id" element={<Institutions />} />
              </Route>

              <Route
                path="/alerts"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Alerts />} />
              </Route>

              <Route
                path="/releases"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Releases />} />
              </Route>

              <Route
                path="/invocations"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Invocations />} />
              </Route>

              <Route
                path="/reports"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Reports />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
};

export default App;
