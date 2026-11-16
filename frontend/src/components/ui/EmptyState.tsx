import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-5 py-8 text-center sm:py-10">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.05]">
        <Icon className="h-5 w-5 text-slate-400" aria-hidden="true" />
      </div>
      <h3 className="font-medium text-slate-100">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
