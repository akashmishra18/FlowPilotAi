import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import Logo from '@/components/Logo';
import ErrorBoundary from '@/components/ErrorBoundary';
import PageFallback from '@/components/PageFallback';
import { ToastViewport } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { NAV_GROUPS } from './navigation';
import UserMenu from './UserMenu';
import NotificationCenter from './NotificationCenter';

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const role = useAuthStore((s) => s.user?.role);

  return (
    <nav aria-label="Primary" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => !item.allow || (role && item.allow.includes(role)));
        if (items.length === 0) return null;
        return (
          <div key={group.label}>
            {!collapsed && <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.label}</p>}
            <ul className="space-y-0.5">
              {items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={onNavigate}
                    title={collapsed ? label : undefined}
                    className={({ isActive }) =>
                      clsx(
                        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                        collapsed && 'justify-center px-2',
                        isActive ? 'bg-brand-500/15 text-white before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-full before:bg-amber-400' : 'text-slate-300 hover:bg-white/[0.06] hover:text-white',
                      )
                    }
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    {collapsed ? (
                      <span className="sr-only">
                        {label}
                      </span>
                    ) : (
                      <span className="flex-1 truncate">{label}</span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export default function AppLayout() {
  const collapsed = !useUIStore((s) => s.isSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const isAgentWorkspace = location.pathname === '/ai-agent';

  // Close the mobile drawer on navigation and on Escape.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-800 bg-[#0e1929] transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[4.75rem]' : 'w-64',
        )}
      >
        <div className={clsx('flex min-h-16 w-full items-center border-b border-slate-800 px-4 py-3', collapsed && 'justify-center')}>
          <Logo size="sm" variant={collapsed ? 'stacked' : 'horizontal'} />
        </div>
        <SidebarNav collapsed={collapsed} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside role="dialog" aria-modal="true" aria-label="Navigation" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-slate-800 bg-[#0e1929] shadow-2xl">
            <div className="flex min-h-16 items-center justify-between border-b border-slate-800 px-5 py-3">
              <Logo size="md" variant="horizontal" />
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className={clsx('workspace-shell min-h-screen transition-[padding] duration-200', collapsed ? 'lg:pl-[4.75rem]' : 'lg:pl-64')}>
        <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-slate-800 bg-canvas/95 px-4 backdrop-blur-xl sm:px-6">
          <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden">
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:block"
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" aria-hidden="true" /> : <PanelLeftClose className="h-5 w-5" aria-hidden="true" />}
          </button>
          <div className="flex-1" />
          <NotificationCenter />
          <UserMenu />
        </header>

        <main id="main-content" tabIndex={-1} className={clsx('mx-auto w-full max-w-7xl px-4 py-6 focus:outline-none sm:px-6 lg:px-8 lg:py-8', isAgentWorkspace && 'agent-workspace-main')}>
          <div key={location.pathname} className={clsx('fp-page-enter min-w-0', isAgentWorkspace && 'h-full')}>
            <ErrorBoundary key={location.pathname}>
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      <ToastViewport />
    </div>
  );
}
