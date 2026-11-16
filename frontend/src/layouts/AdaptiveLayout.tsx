import { useAuthStore } from '@/store/authStore';
import AppLayout from './AppLayout';
import PublicLayout from './PublicLayout';

/** For routes that are public but should sit inside the app shell once signed in (e.g. /status). */
export default function AdaptiveLayout() {
  const user = useAuthStore((s) => s.user);
  const isInitializing = useAuthStore((s) => s.isInitializing);

  if (isInitializing) return <div className="min-h-screen bg-canvas" aria-busy="true" />;
  return user ? <AppLayout /> : <PublicLayout />;
}
