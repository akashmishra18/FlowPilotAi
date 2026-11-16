import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import Card from './Card';
import Skeleton from './Skeleton';

interface StatCardProps {
  label: string;
  icon: LucideIcon;
  /** number → shown; null → "Not available"; undefined while loading */
  value: number | null | undefined;
  hint?: ReactNode;
  to?: string;
  accent?: boolean;
}

export default function StatCard({ label, icon: Icon, value, hint, to, accent = false }: StatCardProps) {
  const body = (
    <Card interactive={Boolean(to)} className={`fp-metric-card relative h-full overflow-hidden ${accent ? 'before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-amber-400/80' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3">
        {value === undefined ? (
          <Skeleton className="h-8 w-16" />
        ) : value === null ? (
          <span className="text-sm text-slate-400">Not available</span>
        ) : (
          <span className="fp-metric-value inline-block text-3xl font-semibold tracking-tight text-slate-900">{value}</span>
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </Card>
  );
  return to ? (
    <Link to={to} className="block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}
