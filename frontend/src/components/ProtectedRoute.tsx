import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export default function ProtectedRoute() {
  const user = useAuthStore((s) => s.user);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const location = useLocation();

  if (isInitializing) {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center gap-2 bg-canvas text-sm text-slate-400">
        <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Restoring your session…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
