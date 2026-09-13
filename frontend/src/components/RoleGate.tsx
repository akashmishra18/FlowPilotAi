import { ReactNode } from 'react';
import { useAuthStore, CurrentUser } from '@/store/authStore';

interface RoleGateProps {
  allow: CurrentUser['role'][];
  children: ReactNode;
}

/**
 * Purely a UI convenience (e.g. hiding a "Create Employee" button from
 * non-admins) — never a substitute for backend authorization, which is
 * enforced independently by `requireRole` on every request.
 */
export default function RoleGate({ allow, children }: RoleGateProps) {
  const role = useAuthStore((s) => s.user?.role);
  if (!role || !allow.includes(role)) return null;
  return <>{children}</>;
}
