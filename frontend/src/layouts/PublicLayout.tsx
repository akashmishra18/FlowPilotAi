import { Suspense } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import Logo from '@/components/Logo';
import ErrorBoundary from '@/components/ErrorBoundary';
import PageFallback from '@/components/PageFallback';
import { ToastViewport, buttonClasses } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

/** Shell for pages reachable without signing in (landing page, system status). */
export default function PublicLayout() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-slate-800 bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between px-4 py-2 sm:px-6">
          <Link to="/" aria-label="FlowPilot AI home">
            <span className="hidden sm:inline-flex"><Logo size="md" variant="horizontal" /></span>
            <span className="sm:hidden"><Logo size="sm" variant="stacked" /></span>
          </Link>
          <nav aria-label="Public" className="flex items-center gap-2">
            <Link to="/status" className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
              System status
            </Link>
            {user ? (
              <Link to="/dashboard" className={buttonClasses({ variant: 'primary', size: 'sm' })}>
                Open dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
                  Sign in
                </Link>
                <Link to="/register" className={buttonClasses({ variant: 'primary', size: 'sm' })}>
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main-content" className="flex-1">
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
          <div key={location.pathname} className="fp-page-enter">
            <Outlet />
          </div>
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">FlowPilot AI — operations control center for game studios</footer>
      <ToastViewport />
    </div>
  );
}
