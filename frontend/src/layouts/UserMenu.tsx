import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, HeartPulse, LogOut, Settings, UserCircle } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { logoutRequest } from '@/services/authApi';

export default function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  async function handleLogout() {
    setOpen(false);
    try {
      await logoutRequest();
    } finally {
      // Clear the local session even if the server call failed.
      clearSession();
      navigate('/login', { replace: true });
    }
  }

  const itemClass = 'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-50';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-slate-800"
      >
        <Avatar name={user.name} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[10rem] truncate text-sm font-medium text-slate-100">{user.name}</span>
          <span className="block text-[11px] text-slate-400">{user.role.replace('_', ' ')}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
      </button>

      <div id={menuId} data-open={open} aria-hidden={!open} role="menu" className="fp-popover absolute right-0 z-40 mt-2 w-56 rounded-xl border border-slate-700 bg-raised p-1.5 shadow-premium">
          <div className="border-b border-slate-700 px-3 pb-2 pt-1.5">
            <p className="truncate text-sm font-medium text-slate-100">{user.name}</p>
            <p className="truncate text-xs text-slate-400">{user.email}</p>
          </div>
          <div className="pt-1.5">
            <Link role="menuitem" to="/profile" onClick={() => setOpen(false)} className={itemClass}>
              <UserCircle className="h-4 w-4" aria-hidden="true" /> My profile
            </Link>
            <Link role="menuitem" to="/settings" onClick={() => setOpen(false)} className={itemClass}>
              <Settings className="h-4 w-4" aria-hidden="true" /> Settings
            </Link>
            <Link role="menuitem" to="/status" onClick={() => setOpen(false)} className={itemClass}>
              <HeartPulse className="h-4 w-4" aria-hidden="true" /> System status
            </Link>
            <button role="menuitem" type="button" onClick={handleLogout} className={`${itemClass} text-rose-300 hover:text-rose-200`}>
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </button>
          </div>
      </div>
    </div>
  );
}
