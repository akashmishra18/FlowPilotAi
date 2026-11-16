import { useEffect, useRef, useState } from 'react';
import { Bell, Check, ClipboardCheck, MessageSquare, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppNotification, getNotifications, markNotificationRead } from '@/features/messaging/api';
import { toast } from '@/store/toastStore';

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const result = await getNotifications();
        if (!alive) return;
        const ids = new Set(result.notifications.map((n) => n._id));
        if (seen.current) {
          result.notifications.filter((n) => !seen.current?.has(n._id)).forEach((n) => toast.info(n.title));
        }
        seen.current = ids;
        setItems(result.notifications);
        setUnreadCount(result.unreadCount);
      } catch { /* The notification bell remains usable when this optional feed is unavailable. */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  async function follow(item: AppNotification) {
    try { if (!item.readAt) await markNotificationRead(item._id); } catch { /* Navigation still works if marking read fails. */ }
    setItems((old) => old.map((n) => n._id === item._id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n));
    setUnreadCount((count) => Math.max(0, count - (item.readAt ? 0 : 1)));
    setOpen(false);
    navigate(item.href);
  }

  return (
    <div className="relative">
      <button type="button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="relative rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-slate-50">
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-4 text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      <div data-open={open} aria-hidden={!open} className="fp-popover absolute right-0 z-50 mt-2 w-[min(92vw,22rem)] overflow-hidden rounded-xl border border-slate-700 bg-raised shadow-premium">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3"><h2 className="text-sm font-semibold text-slate-100">Notifications</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className="rounded p-1 text-slate-400 hover:bg-slate-700"><X className="h-4 w-4" /></button></div>
        {items.length === 0 ? <p className="px-4 py-6 text-sm text-slate-400">You’re all caught up.</p> : <ul className="max-h-96 divide-y divide-slate-700 overflow-y-auto">{items.map((item) => <li key={item._id}><button type="button" onClick={() => void follow(item)} className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-800 ${item.readAt ? '' : 'bg-brand-50'}`}><span className="mt-0.5 text-brand-300">{item.type === 'NEW_MESSAGE' ? <MessageSquare className="h-4 w-4" /> : item.type === 'SCHEDULED_SUMMARY' ? <Sparkles className="h-4 w-4" /> : item.type === 'APPROVAL_UPDATE' ? <ClipboardCheck className="h-4 w-4" /> : <Check className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-100">{item.title}</span><span className="block truncate text-xs text-slate-300">{item.body}</span><span className="mt-1 block text-[11px] text-slate-400">In-app: {item.inAppStatus.toLowerCase()} · Email: {item.emailStatus.toLowerCase().replace('_', ' ')}</span><span className="mt-1 block text-[11px] text-slate-400">{new Date(item.createdAt).toLocaleString()}</span></span>{!item.readAt && <span className="mt-1 h-2 w-2 rounded-full bg-brand-400" />}</button></li>)}</ul>}
      </div>
    </div>
  );
}
