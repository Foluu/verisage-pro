
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import MappingsPage from './pages/MappingsPage';
import IncomePage from './pages/IncomePage';
import AuditPage from './pages/AuditPage';



function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-center"><div className="spinner" /><span>Loading…</span></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}



function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={
        <ProtectedRoute>
          <AppShell />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"    element={<DashboardPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="mappings"     element={<MappingsPage />} />
        <Route path="income"       element={<IncomePage />} />
        <Route path="audit"        element={<AuditPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}



export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );

}