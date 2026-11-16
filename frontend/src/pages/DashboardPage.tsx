import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckSquare, FolderKanban, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeading, EmptyState, PageHeader, Skeleton, StatCard } from '@/components/ui';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchDashboardData, DashboardData } from '@/features/dashboard/dashboardApi';
import { TaskPriorityBadge, TaskStatusBadge } from '@/features/tasks/TaskBadges';
import { formatDueDate, isOverdue } from '@/features/tasks/ui';
import { Task } from '@/features/tasks/types';
import { useAuthStore } from '@/store/authStore';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const ROLE_SUBTITLE: Record<string, string> = {
  ADMIN: 'A clear view of your people, projects, and work.',
  MANAGER: 'An overview of the projects you manage and their tasks.',
  TEAM_LEAD: 'Your assigned work and the projects you belong to.',
  EMPLOYEE: 'Your assigned work and the projects you belong to.',
};

function TaskRow({ task }: { task: Task }) {
  return (
    <li>
      <Link to={`/tasks/${task._id}`} className={`flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.04] ${isOverdue(task) ? 'border-l-2 border-amber-400/70 pl-3' : ''}`}>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-100">{task.title}</span>
          <span className="block truncate text-xs text-slate-400">{task.projectId?.projectCode ?? 'Unknown project'} · Due {formatDueDate(task.dueDate)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="hidden sm:block"><TaskPriorityBadge priority={task.priority} /></span>
          <TaskStatusBadge status={task.status} />
        </span>
      </Link>
    </li>
  );
}

function SectionError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return <Alert tone="error" title={`${what} could not be loaded`} action={<Button size="sm" onClick={onRetry}>Retry</Button>} />;
}

function SetupStep({ number, title, detail, to, done, secondLink }: { number: number; title: string; detail: string; to: string; done?: boolean; secondLink?: { label: string; to: string } }) {
  return (
    <li className="flex flex-col items-start gap-2 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:gap-3">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-emerald-100 text-emerald-800' : 'bg-brand-50 text-brand-700'}`}>
        {done ? '✓' : number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{title}{done && <Badge tone="success" className="ml-2">Started</Badge>}</p>
        <p className="mt-0.5 text-sm text-slate-600">{detail}</p>
      </div>
      <span className="flex shrink-0 items-center gap-3 pl-9 sm:pl-0">
        {secondLink && <Link to={secondLink.to} className="text-sm font-medium text-brand-700 hover:text-brand-800">{secondLink.label}</Link>}
        <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
          Open <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </span>
    </li>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const canListEmployees = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const fetcher = useCallback(() => fetchDashboardData(canListEmployees), [canListEmployees]);
  const { data, error, isInitialLoading, reload } = useAsyncData<DashboardData>(fetcher, 'Could not load the dashboard.');
  const loading = isInitialLoading && !data;
  const isAdmin = user?.role === 'ADMIN';
  const employeeCount = data?.employeeTotal ?? 0;
  const projectCount = data?.projects?.total ?? 0;
  const taskCount = data?.tasks?.total ?? 0;
  const showGettingStarted = isAdmin && data && !data.failed.employees && !data.failed.projects && !data.failed.tasks && (employeeCount === 0 || projectCount === 0 || taskCount === 0);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`${greeting()}, ${user?.name.split(' ')[0] ?? ''}. ${ROLE_SUBTITLE[user?.role ?? 'EMPLOYEE']}`}
        actions={<Button size="sm" onClick={() => void reload()} aria-label="Refresh dashboard"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh</Button>}
      />

      {error && !data && (
        <Alert tone="error" title="Couldn't load your overview" className="mb-6" action={<Button size="sm" onClick={() => void reload()}>Retry</Button>}>
          {error}
        </Alert>
      )}

      <section aria-label="Summary" aria-busy={loading} className="fp-stagger mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={canListEmployees ? 'Projects' : 'My projects'} icon={FolderKanban} to="/projects" value={loading ? undefined : data?.projects?.total ?? null} />
        <StatCard label={canListEmployees ? 'Tasks' : 'My tasks'} icon={CheckSquare} to="/tasks" value={loading ? undefined : data?.tasks?.total ?? null} />
        <StatCard label="Overdue tasks" icon={AlertTriangle} to="/tasks?overdue=true" value={loading ? undefined : data?.tasks?.overdue ?? null} hint="Past due and not completed" accent />
        {canListEmployees ? (
          <StatCard label="Employees" icon={Users} to="/employees" value={loading ? undefined : data?.employeeTotal ?? null} />
        ) : (
          <StatCard label="Completed tasks" icon={CheckSquare} to="/tasks?status=COMPLETED" value={loading ? undefined : data?.tasks?.byStatus.COMPLETED ?? null} />
        )}
      </section>

      {showGettingStarted && (
        <Card className="mb-6">
          <CardHeading title="Getting started" description="Set up your workspace in this order. You can return here as the team grows." />
          <ol>
            <SetupStep number={1} title="Add or identify employees" detail="Employee records link to existing user accounts. The account must exist first." to="/employees" done={employeeCount > 0} />
            <SetupStep number={2} title="Create a project and choose its manager" detail="Select an active manager, then add the people working on this project." to="/projects" done={projectCount > 0} />
            <SetupStep number={3} title="Add project members" detail="Only project members can be assigned to its tasks." to="/projects" />
            <SetupStep number={4} title="Create tasks and assign employees" detail="Choose a project first; assignees come from that project's active members." to={projectCount > 0 ? '/tasks' : '/projects'} done={taskCount > 0} />
            <SetupStep number={5} title="Track work and review requests" detail="Follow task progress and review task reassignment requests when they arrive." to="/approvals" secondLink={{ label: 'Tasks', to: '/tasks' }} />
          </ol>
        </Card>
      )}

      {data?.failed.employees && <div className="mb-4"><SectionError what="Employee count" onRetry={() => void reload()} /></div>}
      {data?.failed.projects && <div className="mb-4"><SectionError what="Projects" onRetry={() => void reload()} /></div>}
      {data?.failed.tasks && <div className="mb-4"><SectionError what="Tasks" onRetry={() => void reload()} /></div>}

      <Card>
        <CardHeading
          title="Overdue tasks"
          description="Incomplete tasks past their due date."
          action={<Link to="/ai-agent" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700">Open assistant <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
        />
        {loading ? (
          <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-10" />)}</div>
        ) : data?.failed.tasks ? (
          <p className="text-sm text-slate-500">Task data is unavailable. Use Retry above to load it again.</p>
        ) : data?.overdueTasks.length ? (
          <ul className="-mx-2 divide-y divide-white/5">{data.overdueTasks.map((task) => <TaskRow key={task._id} task={task} />)}</ul>
        ) : (
          <EmptyState icon={AlertTriangle} title="No overdue tasks" description="Incomplete tasks past their due date will appear here." />
        )}
      </Card>

      {!loading && data && !data.failed.projects && !data.failed.tasks && data.projects?.total === 0 && data.tasks?.total === 0 && !showGettingStarted && (
        <div className="mt-6"><EmptyState icon={FolderKanban} title="Nothing to show yet" description="When you join a project or receive a task, it will appear here." /></div>
      )}

      <section aria-label="Shortcuts" className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Quick links</h2>
        <div className="fp-stagger flex flex-wrap gap-3">
          {canListEmployees && <Link to="/employees" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Users className="h-4 w-4" aria-hidden="true" /> Employees</Link>}
          <Link to="/projects" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><FolderKanban className="h-4 w-4" aria-hidden="true" /> Projects</Link>
          <Link to="/tasks" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><CheckSquare className="h-4 w-4" aria-hidden="true" /> Tasks</Link>
          <Link to="/approvals" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Approvals</Link>
        </div>
      </section>
    </div>
  );
}
