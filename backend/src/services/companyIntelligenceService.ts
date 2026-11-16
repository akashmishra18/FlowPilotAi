import { Role } from '../config/constants';
import { getCurrentEmployeeProfile, getEmployees } from './employeeService';
import { getProjects } from './projectService';
import { listTasks } from './taskService';
import { AppError } from '../utils/AppError';

export type CompanyIntelligenceView = 'managers_and_reports' | 'employee_projects' | 'employee_tasks' | 'project_overview' | 'pending_tasks' | 'overdue_tasks' | 'employee_summary' | 'team_summary';
export interface CompanyIntelligenceActor { id: string; role: Role }

function normalized(value: string) { return value.trim().replace(/^\[DEMO\]\s*/i, '').replace(/\s+/g, ' ').toLocaleLowerCase(); }
function id(value: unknown): string | null {
  if (!value) return null;
  return typeof value === 'object' && '_id' in (value as Record<string, unknown>) ? String((value as { _id: unknown })._id) : String(value);
}
function display(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'object' && 'name' in (value as Record<string, unknown>)) return String((value as { name: unknown }).name);
  return null;
}

/** Fixed, read-only views over the same role-scoped service results used by the application APIs. */
export async function queryCompanyIntelligence(actor: CompanyIntelligenceActor, view: CompanyIntelligenceView, subject?: string) {
  if (!['managers_and_reports', 'employee_projects', 'employee_tasks', 'project_overview', 'pending_tasks', 'overdue_tasks', 'employee_summary', 'team_summary'].includes(view)) {
    throw new AppError('Choose a supported company information view.', 400);
  }
  if (subject !== undefined && (typeof subject !== 'string' || subject.trim().length < 2 || subject.length > 100)) throw new AppError('Search name must be between 2 and 100 characters.', 400);

  if (view === 'managers_and_reports') {
    if (!['ADMIN', 'MANAGER'].includes(actor.role)) throw new AppError('Manager and reporting information is not available for this account.', 403);
    const { employees } = await getEmployees(actor, { limit: 100 });
    const ownProfile = actor.role === 'MANAGER' ? await getCurrentEmployeeProfile(actor).catch(() => null) : null;
    const groups = actor.role === 'MANAGER'
      ? [{ manager: display(ownProfile?.user) ?? 'Your manager profile name is unavailable', directReports: employees.map((employee: Record<string, unknown>) => ({ name: display(employee.user) ?? 'Employee name unavailable', employeeId: employee.employeeId })) }]
      : employees.flatMap((candidate: Record<string, unknown>) => {
        const reports = employees.filter((employee: Record<string, unknown>) => String(employee.managerId ?? '') === String(candidate._id));
        const role = (candidate.user as Record<string, unknown> | undefined)?.role;
        return role === 'MANAGER' || reports.length ? [{ manager: display(candidate.user) ?? 'Manager name unavailable', directReports: reports.map((report: Record<string, unknown>) => ({ name: display(report.user) ?? 'Employee name unavailable', employeeId: report.employeeId })) }] : [];
      });
    return { view, relationship: 'direct reporting (Employee.managerId)', records: groups, unavailable: actor.role === 'MANAGER' ? 'This view contains only your direct reports. Other managers and their reports are outside your authorized scope.' : groups.length ? null : 'No manager or direct-report records were found.' };
  }

  if (view === 'employee_projects') {
    const projectsResult = await getProjects(actor, { limit: 100 });
    const projects = projectsResult.projects.map((project: Record<string, unknown>) => ({ name: project.name, projectCode: project.projectCode, manager: display(project.managerId) ?? 'Manager name unavailable', members: Array.isArray(project.members) ? project.members.map((member: Record<string, unknown>) => display(member.userId) ?? 'Employee name unavailable') : [] }));
    const search = subject ? normalized(subject) : null;
    const records = search ? projects.filter((project: { members: string[] }) => project.members.some((member) => normalized(member) === search)) : projects;
    return { view, relationship: 'project membership (Project.members)', records, unavailable: records.length ? null : 'No matching project memberships are visible in your authorized scope.' };
  }

  if (view === 'project_overview') {
    if (actor.role === 'EMPLOYEE' || actor.role === 'TEAM_LEAD') throw new AppError('Project overview is not available for this role.', 403);
    const projectsResult = await getProjects(actor, { limit: 100 });
    const tasksResult = await listTasks(actor, { limit: 100 });
    const selected = subject ? projectsResult.projects.filter((project: Record<string, unknown>) => normalized(String(project.name)) === normalized(subject) || normalized(String(project.projectCode)) === normalized(subject)) : projectsResult.projects;
    const records = selected.map((project: Record<string, unknown>) => {
      const projectId = id(project._id);
      const tasks = tasksResult.tasks.filter((task: Record<string, unknown>) => id(task.projectId) === projectId);
      const completed = tasks.filter((task: Record<string, unknown>) => task.status === 'COMPLETED').length;
      return { name: project.name, projectCode: project.projectCode, manager: display(project.managerId) ?? 'Manager name unavailable', members: Array.isArray(project.members) ? project.members.map((member: Record<string, unknown>) => display(member.userId) ?? 'Employee name unavailable') : [], taskCount: tasks.length, completedTasks: completed, progressPercent: tasks.length ? Math.round(completed * 100 / tasks.length) : null };
    });
    return { view, relationship: 'project ownership (Project.managerId), membership (Project.members), and task status', records, unavailable: records.length ? null : 'No matching projects are visible in your authorized scope.' };
  }

  const filters = view === 'overdue_tasks' ? { overdue: true, limit: 100, page: 1 } : { limit: 100, page: 1 };
  const taskResult = await listTasks(actor, filters);
  let tasks = taskResult.tasks as Array<Record<string, unknown>>;
  if (view === 'pending_tasks') tasks = tasks.filter((task) => task.status !== 'COMPLETED');
  if (view === 'employee_tasks' || view === 'employee_summary') {
    if (actor.role === 'ADMIN' || actor.role === 'MANAGER') {
      if (!subject) throw new AppError('Specify an employee name to look up their work.', 400);
      const { employees } = await getEmployees(actor, { search: subject, limit: 100 });
      const matches = employees.filter((employee: Record<string, unknown>) => normalized(display(employee.user) ?? '') === normalized(subject));
      if (matches.length > 1) throw new AppError('More than one employee matches. Please provide a more specific name.', 400);
      if (!matches.length) return { view, records: [], unavailable: 'No employee with that name was found in your authorized scope.' };
      const employeeId = String(matches[0]._id);
      tasks = tasks.filter((task) => id(task.assignedTo) === employeeId);
    } else {
      const profile = await getCurrentEmployeeProfile(actor);
      tasks = tasks.filter((task) => id(task.assignedTo) === String(profile._id));
    }
  }
  if (view === 'team_summary' && actor.role === 'EMPLOYEE') throw new AppError('Team summaries are not available for this role.', 403);
  const records = tasks.map((task) => ({ title: task.title, status: task.status, project: display(task.projectId) ?? 'Project name unavailable', assignee: display((task.assignedTo as Record<string, unknown> | null)?.userId) ?? 'Assignee unavailable', dueDate: task.dueDate ?? null }));
  return { view, relationship: 'task responsibility (Task.assignedTo)', records, total: records.length, unavailable: records.length ? null : 'No matching tasks are visible in your authorized scope.' };
}
