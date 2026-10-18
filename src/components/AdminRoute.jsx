import React, { Suspense } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import PageNotFound from '@/lib/PageNotFound';
import AdminShell from '@/components/zeus/AdminShell';

const AdminLazy = React.lazy(() => import('@/pages/Admin'));

const Fallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-zeus-gold/30 border-t-zeus-gold rounded-full animate-spin" />
  </div>
);

// Admins live in their own shell: no user pages, no onboarding, no AI.
export function AdminSection() {
  const { user, isAuthenticated, isLoadingAuth, authChecked } = useAuth();

  if (isLoadingAuth || !authChecked) {
    return <Fallback />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (user?.role !== 'admin') {
    return <PageNotFound />;
  }
  return (
    <AdminShell>
      <Suspense fallback={<Fallback />}>
        <Outlet />
      </Suspense>
    </AdminShell>
  );
}

export default function AdminRoute() {
  return <AdminSection />;
}
