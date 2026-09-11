import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { refreshSessionRequest } from '@/services/authApi';

/**
 * On first mount, try to silently restore a session using the httpOnly
 * refresh-token cookie (if one exists and is still valid). This is what
 * lets a hard page refresh keep the user logged in even though the access
 * token itself is only ever held in memory.
 */
export function useAuthBootstrap(): void {
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const setInitializing = useAuthStore((s) => s.setInitializing);

  useEffect(() => {
    let cancelled = false;

    refreshSessionRequest()
      .then(({ user, accessToken }) => {
        if (!cancelled) setSession(user, accessToken);
      })
      .catch(() => {
        if (!cancelled) clearSession();
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
