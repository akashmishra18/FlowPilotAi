jest.mock('../../src/services/employeeService', () => ({ getCurrentEmployeeProfile: jest.fn(), getEmployees: jest.fn() }));
jest.mock('../../src/services/projectService', () => ({ getProjects: jest.fn() }));
jest.mock('../../src/services/taskService', () => ({ listTasks: jest.fn() }));

import { queryCompanyIntelligence } from '../../src/services/companyIntelligenceService';
import { getCurrentEmployeeProfile, getEmployees } from '../../src/services/employeeService';
import { getProjects } from '../../src/services/projectService';
import { listTasks } from '../../src/services/taskService';

const employees = getEmployees as jest.Mock;
const currentEmployee = getCurrentEmployeeProfile as jest.Mock;
const projects = getProjects as jest.Mock;
const tasks = listTasks as jest.Mock;
const admin = { id: '64b000000000000000000001', role: 'ADMIN' as const };
const manager = { id: '64b000000000000000000002', role: 'MANAGER' as const };
const employee = { id: '64b000000000000000000003', role: 'EMPLOYEE' as const };

beforeEach(() => { jest.clearAllMocks(); });

it('uses the employee service scope for manager reporting and does not infer project membership as reporting', async () => {
  employees.mockResolvedValue({ employees: [{ employeeId: 'E-1', user: { name: 'Ravi' }, managerId: 'M-1' }] });
  currentEmployee.mockResolvedValue({ _id: 'M-1', user: { name: 'Manager' } });
  const result = await queryCompanyIntelligence(manager, 'managers_and_reports') as { records: Array<{ manager: string; directReports: Array<{ name: string }> }> };
  expect(result.records).toEqual([{ manager: 'Manager', directReports: [{ name: 'Ravi', employeeId: 'E-1' }] }]);
  expect(employees).toHaveBeenCalledWith(manager, { limit: 100 });
});

it('groups direct reports using Employee.managerId for admins without conflating project ownership', async () => {
  employees.mockResolvedValue({ employees: [
    { _id: 'M-1', employeeId: 'M-1', user: { name: 'Sam', role: 'MANAGER' }, managerId: null },
    { _id: 'E-1', employeeId: 'E-1', user: { name: 'Ravi', role: 'EMPLOYEE' }, managerId: 'M-1' },
  ] });
  const result = await queryCompanyIntelligence(admin, 'managers_and_reports') as { records: Array<{ manager: string; directReports: Array<{ name: string }> }> };
  expect(result.records).toEqual([{ manager: 'Sam', directReports: [{ name: 'Ravi', employeeId: 'E-1' }] }]);
});

it('returns only service-authorized project memberships, distinct from reporting relationships', async () => {
  projects.mockResolvedValue({ projects: [{ name: 'Orbit', projectCode: 'ORB', managerId: { name: 'Owner' }, members: [{ userId: { name: 'Ravi' } }] }] });
  const result = await queryCompanyIntelligence(employee, 'employee_projects', 'Ravi') as { relationship: string; records: Array<{ name: string; members: string[] }> };
  expect(result.relationship).toContain('Project.members');
  expect(result.records[0]).toEqual({ name: 'Orbit', projectCode: 'ORB', manager: 'Owner', members: ['Ravi'] });
  expect(projects).toHaveBeenCalledWith(employee, { limit: 100 });
});

it('shows only own task assignments for employees and rejects team-wide summaries', async () => {
  currentEmployee.mockResolvedValue({ _id: 'EMP-1' });
  tasks.mockResolvedValue({ tasks: [{ title: 'Build UI', status: 'IN_PROGRESS', projectId: { name: 'Orbit' }, assignedTo: { _id: 'EMP-1', userId: { name: 'Ravi' } }, dueDate: null }] });
  const result = await queryCompanyIntelligence(employee, 'employee_tasks') as { records: Array<{ title: string; status: string }> };
  expect(result.records).toEqual([{ title: 'Build UI', status: 'IN_PROGRESS', project: 'Orbit', assignee: 'Ravi', dueDate: null }]);
  await expect(queryCompanyIntelligence(employee, 'team_summary')).rejects.toThrow(/not available/);
});

it('rejects unsupported roles for project overview and invalid view input', async () => {
  await expect(queryCompanyIntelligence(employee, 'project_overview')).rejects.toThrow(/not available/);
  await expect(queryCompanyIntelligence(admin, 'not_a_view' as never)).rejects.toThrow(/supported company information view/);
  expect(projects).not.toHaveBeenCalled();
});

it('returns a clear empty state for missing employee matches', async () => {
  employees.mockResolvedValue({ employees: [] });
  tasks.mockResolvedValue({ tasks: [] });
  const result = await queryCompanyIntelligence(admin, 'employee_summary', 'Unknown') as { records: unknown[]; unavailable: string };
  expect(result.records).toEqual([]);
  expect(result.unavailable).toMatch(/authorized scope/);
});
