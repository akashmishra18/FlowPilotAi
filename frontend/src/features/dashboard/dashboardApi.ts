import { listEmployees } from '@/features/employees/employeesApi';
import { listProjects } from '@/features/projects/projectsApi';
import { Project, ProjectStatus } from '@/features/projects/types';
import { listTasks } from '@/features/tasks/tasksApi';
import { Task, TASK_STATUSES, TaskStatus } from '@/features/tasks/types';
import { isOverdue } from '@/features/tasks/ui';

const PROJECT_STATUSES: ProjectStatus[] = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
const PAGE = 100;

export interface DashboardData {
  projects: { total: number; byStatus: Record<ProjectStatus, number> } | null;
  tasks: { total: number; byStatus: Record<TaskStatus, number>; overdue: number } | null;
  /** Null when the role cannot list employees (the endpoint is ADMIN/MANAGER only) or the request failed. */
  employeeTotal: number | null;
  recentTasks: Task[];
  overdueTasks: Task[];
  /** Sections that failed to load, so the UI can show per-section errors instead of fabricating zeros. */
  failed: { projects: boolean; tasks: boolean; employees: boolean };
}

function zeroed<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

async function loadProjects(): Promise<DashboardData['projects']> {
  const first = await listProjects({ limit: PAGE });
  const { total } = first.pagination;
  const byStatus = zeroed(PROJECT_STATUSES);

  if (total <= first.projects.length) {
    // Complete result set: count locally, exactly.
    first.projects.forEach((p: Project) => (byStatus[p.status] += 1));
    return { total, byStatus };
  }
  // More than one page: ask the server for exact per-status totals instead of counting a truncated page.
  const counts = await Promise.all(PROJECT_STATUSES.map((status) => listProjects({ limit: 1, status })));
  PROJECT_STATUSES.forEach((status, i) => (byStatus[status] = counts[i].pagination.total));
  return { total, byStatus };
}

async function loadTasks(): Promise<{ summary: NonNullable<DashboardData['tasks']>; recent: Task[]; overdueList: Task[] }> {
  const first = await listTasks({ limit: PAGE });
  const { total } = first.pagination;
  const byStatus = zeroed(TASK_STATUSES);

  if (total <= first.tasks.length) {
    const now = new Date();
    first.tasks.forEach((t) => (byStatus[t.status] += 1));
    const overdueAll = first.tasks.filter((t) => isOverdue(t, now));
    return { summary: { total, byStatus, overdue: overdueAll.length }, recent: first.tasks.slice(0, 5), overdueList: overdueAll.slice(0, 5) };
  }

  const [counts, overdue] = await Promise.all([Promise.all(TASK_STATUSES.map((status) => listTasks({ limit: 1, status }))), listTasks({ overdue: true, limit: 5 })]);
  TASK_STATUSES.forEach((status, i) => (byStatus[status] = counts[i].pagination.total));
  return { summary: { total, byStatus, overdue: overdue.pagination.total }, recent: first.tasks.slice(0, 5), overdueList: overdue.tasks };
}

/**
 * Typically 2–3 requests: one page of projects, one of tasks (counted
 * locally when the whole set fits) and, for ADMIN/MANAGER, a single
 * limit=1 employees call to read the exact total. Each section fails
 * independently — a failed section is reported, never replaced with zeros.
 */
export async function fetchDashboardData(canListEmployees: boolean): Promise<DashboardData> {
  const [projectsRes, tasksRes, employeesRes] = await Promise.allSettled([
    loadProjects(),
    loadTasks(),
    canListEmployees ? listEmployees({ limit: 1 }) : Promise.resolve(null),
  ]);

  const failed = {
    projects: projectsRes.status === 'rejected',
    tasks: tasksRes.status === 'rejected',
    employees: canListEmployees && employeesRes.status === 'rejected',
  };

  if (failed.projects && failed.tasks && (failed.employees || !canListEmployees)) {
    // Everything failed: surface a single error + retry rather than an empty-looking dashboard.
    throw (projectsRes as PromiseRejectedResult).reason;
  }

  const tasks = tasksRes.status === 'fulfilled' ? tasksRes.value : null;
  return {
    projects: projectsRes.status === 'fulfilled' ? projectsRes.value : null,
    tasks: tasks?.summary ?? null,
    employeeTotal: employeesRes.status === 'fulfilled' && employeesRes.value ? employeesRes.value.pagination.total : null,
    recentTasks: tasks?.recent ?? [],
    overdueTasks: tasks?.overdueList ?? [],
    failed,
  };
}
