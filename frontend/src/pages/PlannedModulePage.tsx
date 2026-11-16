import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Activity, ShieldCheck, Plug, ArrowRight, LucideIcon, RefreshCw, ListChecks } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeading, EmptyState, PageHeader, Skeleton, buttonClasses } from '@/components/ui';
import { useAsyncData } from '@/hooks/useAsyncData';
import { getOverdueTaskAssistant } from '@/features/ai/aiApi';
import { formatDueDate } from '@/features/tasks/ui';
import { useAuthStore } from '@/store/authStore';
import OverdueReminderButton from '@/features/tasks/OverdueReminderButton';

type ModuleKey = 'ai-agent' | 'approvals' | 'activity' | 'integrations';

interface ModuleConfig {
  title: string;
  icon: LucideIcon;
  summary: string;
  capabilities: string[];
  availableNow: { label: string; to: string; note: string }[];
  showPipeline: boolean;
}

/** The intended agent workflow. Shown as a roadmap only — none of these stages are implemented. */
const PIPELINE = ['Request', 'Plan', 'Risk assessment', 'Approval (when needed)', 'Backup', 'Controlled execution', 'Verification', 'Audit history'];

const MODULES: Record<ModuleKey, ModuleConfig> = {
  'ai-agent': {
    title: 'Overdue Task Assistant',
    icon: Bot,
    summary: 'A focused assistant that summarizes overdue tasks. It does not plan or execute general operational requests.',
    capabilities: [
      'Turn a goal such as "summarize overdue work" into a reviewable plan',
      'Call a fixed set of controlled tools — never raw database access',
      'Pause for human approval before risky changes',
      'Verify results and write every action to the audit history',
    ],
    availableNow: [
      { label: 'Tasks', to: '/tasks', note: 'Create, assign and track work — the data the agent will operate on.' },
      { label: 'Projects', to: '/projects', note: 'Project and team structure with role-based access.' },
    ],
    showPipeline: true,
  },
  approvals: {
    title: 'Approvals',
    icon: ShieldCheck,
    summary: 'A review queue for risky or bulk actions. Each request will show exactly what would change, who asked, and let an authorized person approve or reject it.',
    capabilities: [
      'Action previews with the affected records and a before/after summary',
      'Approve / reject decisions limited to authorized roles',
      'Automatic backup before approved changes are executed',
      'Verification result and rollback guidance after execution',
    ],
    availableNow: [
      { label: 'Employees', to: '/employees', note: 'Role-restricted employee management.' },
      { label: 'Tasks', to: '/tasks', note: 'Every change here is already authorized server-side.' },
    ],
    showPipeline: true,
  },
  activity: {
    title: 'Activity & Audit',
    icon: Activity,
    summary: "A tamper-evident history of who did what and when — including actions taken by the AI agent on someone's behalf.",
    capabilities: ['Filterable timeline of user and agent actions', 'Per-record change history', 'Links from each entry back to its approval and verification result'],
    availableNow: [{ label: 'Dashboard', to: '/dashboard', note: 'A summary of projects and tasks you can access.' }],
    showPipeline: false,
  },
  integrations: {
    title: 'Integrations',
    icon: Plug,
    summary: 'Connections that will turn client messages into tracked work and monitor operating cost. None are connected today.',
    capabilities: [
      'Email — turn inbound client email into tickets',
      'WhatsApp — turn client messages into bug reports and tasks',
      'AWS — cloud usage and cost visibility',
      'AI provider — token usage and estimated spend',
    ],
    availableNow: [{ label: 'System Status', to: '/status', note: 'Live health of the backend API and database.' }],
    showPipeline: false,
  },
};

export default function PlannedModulePage({ module }: { module: ModuleKey }) {
  if (module === 'ai-agent') return <OverdueTaskAssistant />;

  const config = MODULES[module];
  const Icon = config.icon;

  return (
    <div>
      <PageHeader title={config.title} description={config.summary} badge={<Badge tone="violet">Planned</Badge>} />

      <Alert tone="info" title="Not available yet" className="mb-6">
        This module has no backend support today. Nothing on this page is live data, and no actions can be run from it.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeading title="What this will do" description="Planned capabilities — not implemented" />
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15">
            <Icon className="h-5 w-5 text-brand-300" aria-hidden="true" />
          </div>
          <ul className="space-y-2.5 text-sm text-slate-300">
            {config.capabilities.map((c) => (
              <li key={c} className="flex gap-2.5">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                {c}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeading title="Available today" description="Working, real modules" />
          <ul className="space-y-3">
            {config.availableNow.map((m) => (
              <li key={m.to}>
                <Link to={m.to} className="group block rounded-lg">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-100 group-hover:text-brand-300">
                    {m.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="text-xs text-slate-400">{m.note}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {config.showPipeline && (
        <Card className="mt-6">
          <CardHeading title="Planned workflow" description="The intended path for every agent-initiated action" />
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE.map((step, i) => (
              <li key={step} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-xs font-semibold text-slate-300">{i + 1}</span>
                <span className="text-sm text-slate-200">{step}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <p className="mt-6 text-center">
        <Link to="/dashboard" className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
          Back to Dashboard
        </Link>
      </p>
    </div>
  );
}

function OverdueTaskAssistant() {
  const fetchAssistant = useCallback(() => getOverdueTaskAssistant(), []);
  const { data, error, isInitialLoading, isLoading, reload } = useAsyncData(fetchAssistant, 'Unable to load overdue work.');
  const canSendReminders = ['ADMIN', 'MANAGER'].includes(useAuthStore((s) => s.user?.role ?? ''));

  return (
    <div>
      <PageHeader
        title="Overdue Task Assistant"
        description="Summarizes overdue, incomplete tasks you can access. It does not make changes or handle general requests."
        badge={<Badge tone="violet">{!data ? 'Summary source shown after load' : data.summarySource === 'AI' ? 'AI-generated' : 'Rule-based'}</Badge>}
        actions={<Button variant="secondary" size="sm" onClick={() => void reload()} isLoading={isLoading && !isInitialLoading}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh</Button>}
      />

      {error && <Alert tone="error" title="Assistant unavailable" className="mb-4" action={<Button variant="ghost" size="sm" onClick={() => void reload()}>Try again</Button>}>{error}</Alert>}
      {data?.fallbackReason && <Alert tone="info" title="Using rule-based summary" className="mb-4">AI summarization is unavailable or not configured. The task list below is still live and role-scoped.</Alert>}

      {isInitialLoading && (
        <Card>
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="mt-4 h-16 w-full" />
        </Card>
      )}

      {!isInitialLoading && data && (
        <>
          <Card className="mb-6 border-brand-500/20 bg-brand-500/[0.06]">
            <CardHeading title="Summary" description={data.summarySource === 'AI' ? 'Generated by the configured AI provider from the role-scoped task data below.' : 'Generated by rules from the role-scoped task data below.'} />
            <p className="text-lg font-medium text-slate-100">{data.summary}</p>
          </Card>

          {data.tasks.length === 0 ? (
            <EmptyState icon={ListChecks} title="No overdue tasks" description="There are no overdue incomplete tasks in your permitted scope." />
          ) : (
            <Card>
              <CardHeading title="Overdue work" description={`${data.total} task${data.total === 1 ? '' : 's'} found`} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="py-3 pr-4">Task</th><th className="py-3 pr-4">Project</th><th className="py-3 pr-4">Assigned to</th><th className="py-3">Due</th>{canSendReminders && <th className="py-3">Reminder</th>}</tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-slate-200">
                    {data.tasks.map((task) => (
                      <tr key={task.id}>
                        <td className="py-3 pr-4 font-medium">{task.title}</td>
                        <td className="py-3 pr-4">{task.project?.name ?? 'Unknown project'}</td>
                        <td className="py-3 pr-4">{task.assignedEmployee?.name ?? 'Unassigned'}</td>
                        <td className="py-3 text-rose-300">{formatDueDate(task.dueDate)}</td>
                        {canSendReminders && <td className="py-3"><OverdueReminderButton taskId={task.id} disabled={!task.assignedEmployee} onSent={() => void reload()} />{!task.assignedEmployee && <span className="ml-2 text-xs text-slate-500">Unassigned</span>}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
