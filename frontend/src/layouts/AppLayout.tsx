import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Home, Activity, Menu, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { useUIStore } from '@/store/uiStore';

const navItems = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/status', label: 'System Status', icon: Activity },
];

export default function AppLayout() {
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside
        className={clsx(
          'bg-white border-r border-gray-200 flex flex-col transition-all duration-200',
          isSidebarOpen ? 'w-60' : 'w-16',
        )}
      >
        <div className="h-16 flex items-center gap-2 px-4 border-b border-gray-200 overflow-hidden">
          <Sparkles className="w-6 h-6 text-brand-500 shrink-0" />
          {isSidebarOpen && <span className="font-semibold text-gray-900 whitespace-nowrap">FlowPilot AI</span>}
        </div>

        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                )
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {isSidebarOpen && <span className="whitespace-nowrap">{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-200 text-xs text-gray-400">
          {isSidebarOpen && <span>Phase 1 — Scaffold</span>}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 gap-4">
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-medium text-gray-500">
            Agentic AI Operations Platform — Game Development Companies
          </h1>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
