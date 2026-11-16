import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Logo from './Logo';
import { Card } from '@/components/ui';

/** Centered card layout shared by sign-in and registration. */
export default function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="fp-page-enter flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10">
      <Link to="/" aria-label="FlowPilot AI home" className="mb-8">
        <Logo size="lg" variant="stacked" animated />
      </Link>
      <main id="main-content" className="w-full max-w-sm">
        <Card className="p-6 sm:p-8">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          <p className="mb-5 mt-1 text-sm text-slate-600">{subtitle}</p>
          {children}
        </Card>
        <p className="mt-5 text-center text-sm text-slate-600">{footer}</p>
      </main>
    </div>
  );
}
