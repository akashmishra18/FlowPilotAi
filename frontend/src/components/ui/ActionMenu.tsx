import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { MoreHorizontal } from 'lucide-react';

export interface ActionMenuItem {
  label: string;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  onSelect: () => void;
}

/** Kebab menu: closes on outside click, Escape and selection; keyboard reachable. */
export default function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} role="menu" className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-white/10 bg-raised p-1 shadow-2xl">
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={clsx(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm',
                item.tone === 'danger' ? 'text-rose-300 hover:bg-rose-500/10' : 'text-slate-300 hover:bg-white/[0.07] hover:text-white',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
