import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  back?: { to: string; label: string };
}

export default function PageHeader({ title, description, actions, badge, back }: PageHeaderProps) {
  return (
    <header className="mb-6">
      {back && (
        <Link to={back.to} className="mb-3 inline-flex items-center gap-1.5 rounded text-sm text-slate-400 transition-colors hover:text-slate-100">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-[1.75rem]">{title}</h1>
            {badge}
          </div>
          {description && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
