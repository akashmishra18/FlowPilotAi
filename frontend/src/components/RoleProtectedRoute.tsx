import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore, CurrentUser } from '@/store/authStore';

interface RoleProtectedRouteProps {
  allow: CurrentUser['role'][];
}

/**
 * Nest this INSIDE <ProtectedRoute/> (which already guarantees the user is
 * authenticated). This only adds a role check on top, redirecting to the
 * dashboard rather than login if the role doesn't match — being logged in
 * but lacking permission is a different case than not being logged in at
 * all. This is a UX convenience only; the backend's `requireRole` is what
 * actually enforces the rule.
 */
export default function RoleProtectedRoute({ allow }: RoleProtectedRouteProps) {
  const role = useAuthStore((s) => s.user?.role);

  if (!role || !allow.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
