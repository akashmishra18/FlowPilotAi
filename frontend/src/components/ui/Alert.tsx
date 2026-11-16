import { ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

type AlertTone = 'error' | 'warning' | 'success' | 'info';

const tones: Record<AlertTone, { box: string; Icon: typeof Info }> = {
  error: { box: 'border-rose-900/70 bg-rose-950/40 text-rose-200', Icon: XCircle },
  warning: { box: 'border-amber-800/70 bg-amber-950/35 text-amber-200', Icon: AlertTriangle },
  success: { box: 'border-emerald-900/70 bg-emerald-950/35 text-emerald-200', Icon: CheckCircle2 },
  info: { box: 'border-sky-900/70 bg-sky-950/35 text-sky-200', Icon: Info },
};

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export default function Alert({ tone = 'info', title, children, action, className }: AlertProps) {
  const { box, Icon } = tones[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={clsx('fp-feedback-enter flex items-start gap-3 rounded-lg border px-4 py-3 text-sm', box, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={clsx(title && 'mt-0.5 opacity-90')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
