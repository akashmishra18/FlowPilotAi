import clsx from 'clsx';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToastStore } from '@/store/toastStore';

const toneStyle = {
  success: { box: 'border-emerald-200', Icon: CheckCircle2, icon: 'text-emerald-700' },
  error: { box: 'border-rose-200', Icon: XCircle, icon: 'text-rose-700' },
  info: { box: 'border-sky-200', Icon: Info, icon: 'text-sky-700' },
} as const;

/** Mounted once per layout. Polite live region so success/error feedback is announced. */
export default function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2">
      {toasts.map((t) => {
        const { box, Icon, icon } = toneStyle[t.tone];
        return (
          <div key={t.id} className={clsx('fp-toast-enter pointer-events-auto flex items-start gap-3 rounded-lg border bg-white px-4 py-3 text-sm text-slate-800 shadow-xl', box)}>
            <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', icon)} aria-hidden="true" />
            <p className="flex-1">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="rounded p-0.5 text-slate-500 hover:text-slate-800">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
