import { ReactNode } from 'react';
import { Alert, Badge, Button, Card, CardHeading, PageHeader } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';

const PLANNED_SETTINGS = ['Notification preferences', 'Approval policies and risk thresholds', 'AI usage limits and cost alerts', 'Integration credentials'];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="text-sm font-medium text-slate-100">{children}</dd>
    </div>
  );
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api';

  return (
    <div>
      <PageHeader title="Settings" description="Only settings that are actually implemented are editable here." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeading title="Account" description="Read-only. Profile editing is not available yet." />
          <dl className="divide-y divide-white/10">
            <Row label="Name">{user?.name}</Row>
            <Row label="Email">{user?.email}</Row>
            <Row label="Role">
              <Badge tone="violet">{user?.role.replace('_', ' ')}</Badge>
            </Row>
          </dl>
        </Card>

        <Card>
          <CardHeading title="Interface" />
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-100">Compact sidebar</p>
              <p className="text-xs text-slate-400">Applies to this browser session only; it is not saved to your account.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={toggleSidebar} aria-pressed={!isSidebarOpen}>
              {isSidebarOpen ? 'Collapse' : 'Expand'}
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeading title="Connection" />
          <dl className="divide-y divide-white/10">
            <Row label="API base URL">
              <code className="break-all text-xs text-slate-300">{apiBase}</code>
            </Row>
          </dl>
          <p className="mt-3 text-xs text-slate-400">Configured with VITE_API_BASE_URL at build time.</p>
        </Card>

        <Card>
          <CardHeading title="Planned settings" description="Not implemented — nothing here is saved." />
          <ul className="space-y-2">
            {PLANNED_SETTINGS.map((s) => (
              <li key={s} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-400">
                {s} <Badge>Planned</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Alert tone="info" className="mt-6">
        Security-related actions such as changing your password are not part of the current backend.
      </Alert>
    </div>
  );
}
