import { Types } from 'mongoose';

jest.mock('../../src/models/Task');
jest.mock('../../src/models/Project');
jest.mock('../../src/models/Employee');

import { TaskModel } from '../../src/models/Task';
import { ProjectModel } from '../../src/models/Project';
import { EmployeeModel } from '../../src/models/Employee';
import * as taskService from '../../src/services/taskService';

const mockedTask = TaskModel as jest.Mocked<typeof TaskModel>;
const mockedProject = ProjectModel as jest.Mocked<typeof ProjectModel>;
const mockedEmployee = EmployeeModel as jest.Mocked<typeof EmployeeModel>;

/** Fluent mongoose-query-like mock terminating in `lean()`. */
function chainable(resolvedValue: unknown) {
  const chain: Record<string, jest.Mock> = {};
  ['populate', 'sort', 'skip', 'limit', 'select'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.lean = jest.fn().mockResolvedValue(resolvedValue);
  return chain as never;
}

const oid = () => new Types.ObjectId();
const adminId = oid().toString();
const managerId = oid().toString();
const otherManagerId = oid().toString();
const assigneeUserId = oid().toString();
const strangerUserId = oid().toString();
const projectId = oid();
const memberEmpId = oid();
const otherEmpId = oid();
const taskId = oid().toString();

const admin = { id: adminId, role: 'ADMIN' as const };
const manager = { id: managerId, role: 'MANAGER' as const };
const otherManager = { id: otherManagerId, role: 'MANAGER' as const };
const assignee = { id: assigneeUserId, role: 'EMPLOYEE' as const };
const stranger = { id: strangerUserId, role: 'EMPLOYEE' as const };

const project = (overrides: Record<string, unknown> = {}) => ({
  _id: projectId,
  managerId: new Types.ObjectId(managerId),
  members: [memberEmpId],
  isActive: true,
  ...overrides,
});

const taskDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(taskId),
  title: 'Fix crash',
  description: '',
  projectId,
  assignedTo: memberEmpId,
  priority: 'MEDIUM',
  status: 'TODO',
  dueDate: null,
  completedAt: null,
  tags: [],
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

/** Queues the lookups updateTask/assign/status/delete perform before acting. */
function primeContext(task: ReturnType<typeof taskDoc>, proj = project()) {
  mockedTask.findById.mockResolvedValueOnce(task as never);
  mockedProject.findById.mockReturnValueOnce(chainable(proj));
}
function primeAssigneeLookup(employeeId: Types.ObjectId | null) {
  mockedEmployee.findOne.mockReturnValueOnce(chainable(employeeId ? { _id: employeeId } : null));
}
function primePopulatedResult(value: unknown = { _id: taskId }) {
  mockedTask.findById.mockReturnValueOnce(chainable(value));
}

beforeEach(() => jest.resetAllMocks());

describe('createTask', () => {
  const base = { title: 'Fix crash', projectId: projectId.toString() };

  function primeCreate(proj = project(), employee: unknown = { _id: memberEmpId, isActive: true }) {
    mockedProject.findById.mockReturnValueOnce(chainable(proj));
    mockedEmployee.findById.mockReturnValueOnce(chainable(employee));
    mockedTask.create.mockResolvedValueOnce({ _id: taskId } as never);
    primePopulatedResult();
  }

  it('ADMIN can create a task assigned to an active project member', async () => {
    primeCreate();
    await taskService.createTask(admin, { ...base, assignedTo: memberEmpId.toString() });

    expect(mockedTask.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Fix crash', createdBy: adminId, assignedTo: memberEmpId, status: 'TODO', priority: 'MEDIUM' }),
    );
  });

  it("the project's MANAGER can create a task", async () => {
    primeCreate();
    await taskService.createTask(manager, base);
    expect(mockedTask.create).toHaveBeenCalledTimes(1);
  });

  it('normalizes tags (trim, lowercase, dedupe)', async () => {
    primeCreate();
    await taskService.createTask(admin, { ...base, tags: [' Bug ', 'bug', 'UI'] });
    expect(mockedTask.create).toHaveBeenCalledWith(expect.objectContaining({ tags: ['bug', 'ui'] }));
  });

  it('a MANAGER of a different project cannot create a task', async () => {
    mockedProject.findById.mockReturnValueOnce(chainable(project()));
    await expect(taskService.createTask(otherManager, base)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockedTask.create).not.toHaveBeenCalled();
  });

  it('an EMPLOYEE cannot create a task', async () => {
    mockedProject.findById.mockReturnValueOnce(chainable(project()));
    await expect(taskService.createTask(assignee, base)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a malformed projectId', async () => {
    await expect(taskService.createTask(admin, { ...base, projectId: 'nope' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a projectId that does not exist', async () => {
    mockedProject.findById.mockReturnValueOnce(chainable(null));
    await expect(taskService.createTask(admin, base)).rejects.toMatchObject({ statusCode: 400 });
    expect(mockedTask.create).not.toHaveBeenCalled();
  });

  it('rejects creating a task on an inactive project', async () => {
    mockedProject.findById.mockReturnValueOnce(chainable(project({ isActive: false })));
    await expect(taskService.createTask(admin, base)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an assignee that does not exist', async () => {
    mockedProject.findById.mockReturnValueOnce(chainable(project()));
    mockedEmployee.findById.mockReturnValueOnce(chainable(null));
    await expect(
      taskService.createTask(admin, { ...base, assignedTo: memberEmpId.toString() }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockedTask.create).not.toHaveBeenCalled();
  });

  it('rejects an inactive assignee', async () => {
    mockedProject.findById.mockReturnValueOnce(chainable(project()));
    mockedEmployee.findById.mockReturnValueOnce(chainable({ _id: memberEmpId, isActive: false }));
    await expect(
      taskService.createTask(admin, { ...base, assignedTo: memberEmpId.toString() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an active employee who is not a member of the project', async () => {
    mockedProject.findById.mockReturnValueOnce(chainable(project()));
    mockedEmployee.findById.mockReturnValueOnce(chainable({ _id: otherEmpId, isActive: true }));
    await expect(
      taskService.createTask(admin, { ...base, assignedTo: otherEmpId.toString() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an invalid dueDate', async () => {
    mockedProject.findById.mockReturnValueOnce(chainable(project()));
    await expect(taskService.createTask(admin, { ...base, dueDate: 'not-a-date' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('listTasks (role-scoped visibility and typed filters)', () => {
  beforeEach(() => {
    mockedTask.find.mockReturnValue(chainable([{ _id: taskId }]));
    mockedTask.countDocuments.mockResolvedValue(1 as never);
  });
  const lastQuery = () => (mockedTask.find.mock.calls as unknown[][])[0][0] as { $and?: Record<string, unknown>[] };

  it('ADMIN is not scoped and gets typed filters applied', async () => {
    await taskService.listTasks(admin, {
      projectId: projectId.toString(),
      assignedTo: memberEmpId.toString(),
      status: 'IN_PROGRESS',
      priority: 'HIGH',
    });
    expect(lastQuery().$and).toEqual(
      expect.arrayContaining([
        { projectId: projectId.toString() },
        { assignedTo: memberEmpId.toString() },
        { status: 'IN_PROGRESS' },
        { priority: 'HIGH' },
      ]),
    );
  });

  it('ADMIN with no filters sends an empty query', async () => {
    await taskService.listTasks(admin, {});
    expect(mockedTask.find).toHaveBeenCalledWith({});
  });

  it("MANAGER is restricted to tasks in projects they manage", async () => {
    mockedProject.find.mockReturnValueOnce(chainable([{ _id: projectId }]));
    await taskService.listTasks(manager, {});
    expect(lastQuery().$and).toEqual(expect.arrayContaining([{ projectId: { $in: [projectId.toString()] } }]));
  });

  it('MANAGER filtering by a project they do not manage gets an empty result', async () => {
    mockedProject.find.mockReturnValueOnce(chainable([{ _id: projectId }]));
    const result = await taskService.listTasks(manager, { projectId: oid().toString() });
    expect(result.tasks).toEqual([]);
    expect(mockedTask.find).not.toHaveBeenCalled();
  });

  it('MANAGER managing no projects gets an empty result', async () => {
    mockedProject.find.mockReturnValueOnce(chainable([]));
    const result = await taskService.listTasks(manager, {});
    expect(result.pagination.total).toBe(0);
  });

  it("EMPLOYEE only sees tasks assigned to them, overriding any assignedTo filter", async () => {
    primeAssigneeLookup(memberEmpId);
    await taskService.listTasks(assignee, { assignedTo: otherEmpId.toString() });
    const conditions = lastQuery().$and!;
    expect(conditions).toContainEqual({ assignedTo: memberEmpId });
    expect(conditions).not.toContainEqual({ assignedTo: otherEmpId.toString() });
  });

  it('EMPLOYEE without an employee profile gets an empty result', async () => {
    primeAssigneeLookup(null);
    const result = await taskService.listTasks(assignee, {});
    expect(result.tasks).toEqual([]);
  });

  it('overdue=true excludes COMPLETED tasks and requires a past dueDate', async () => {
    await taskService.listTasks(admin, { overdue: true });
    expect(lastQuery().$and).toEqual(
      expect.arrayContaining([{ dueDate: { $lt: expect.any(Date) }, status: { $ne: 'COMPLETED' } }]),
    );
  });

  it('applies a dueDate range', async () => {
    await taskService.listTasks(admin, { dueDateFrom: '2025-01-01', dueDateTo: '2025-02-01' });
    expect(lastQuery().$and).toEqual(
      expect.arrayContaining([{ dueDate: { $gte: expect.any(Date) } }, { dueDate: { $lte: expect.any(Date) } }]),
    );
  });

  it('escapes regex characters in search so input is matched literally', async () => {
    await taskService.listTasks(admin, { search: 'a.b(c' });
    const searchCondition = lastQuery().$and!.find((c) => '$or' in c) as { $or: { title?: RegExp }[] };
    expect(searchCondition.$or[0].title!.source).toBe('a\\.b\\(c');
  });

  it('rejects a malformed projectId filter', async () => {
    await expect(taskService.listTasks(admin, { projectId: 'bad' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('paginates', async () => {
    mockedTask.countDocuments.mockResolvedValue(45 as never);
    const result = await taskService.listTasks(admin, { page: 2, limit: 20 });
    expect(result.pagination).toEqual({ page: 2, limit: 20, total: 45, totalPages: 3 });
  });
});

describe('getTaskById (visibility)', () => {
  const populated = (managerOwner = managerId) => ({
    _id: taskId,
    projectId: { _id: projectId, managerId: managerOwner },
    assignedTo: { _id: memberEmpId },
  });

  it('ADMIN can view any task', async () => {
    mockedTask.findById.mockReturnValueOnce(chainable(populated()));
    await expect(taskService.getTaskById(admin, taskId)).resolves.toBeDefined();
  });

  it("the project's MANAGER can view it", async () => {
    mockedTask.findById.mockReturnValueOnce(chainable(populated()));
    await expect(taskService.getTaskById(manager, taskId)).resolves.toBeDefined();
  });

  it('another MANAGER cannot', async () => {
    mockedTask.findById.mockReturnValueOnce(chainable(populated()));
    await expect(taskService.getTaskById(otherManager, taskId)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('the assignee can view their own task', async () => {
    mockedTask.findById.mockReturnValueOnce(chainable(populated()));
    primeAssigneeLookup(memberEmpId);
    await expect(taskService.getTaskById(assignee, taskId)).resolves.toBeDefined();
  });

  it('an unrelated EMPLOYEE cannot', async () => {
    mockedTask.findById.mockReturnValueOnce(chainable(populated()));
    primeAssigneeLookup(otherEmpId);
    await expect(taskService.getTaskById(stranger, taskId)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('404s when the task does not exist', async () => {
    mockedTask.findById.mockReturnValueOnce(chainable(null));
    await expect(taskService.getTaskById(admin, taskId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('400s on a malformed id', async () => {
    await expect(taskService.getTaskById(admin, 'bad')).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('updateTask', () => {
  it("the project's MANAGER can update title, priority, dueDate and tags", async () => {
    const task = taskDoc();
    primeContext(task);
    primePopulatedResult();
    await taskService.updateTask(manager, taskId, {
      title: 'New title',
      priority: 'CRITICAL',
      dueDate: '2030-01-01',
      tags: ['Urgent'],
    });
    expect(task.title).toBe('New title');
    expect(task.priority).toBe('CRITICAL');
    expect(task.dueDate).toEqual(new Date('2030-01-01'));
    expect(task.tags).toEqual(['urgent']);
    expect(task.save).toHaveBeenCalledTimes(1);
  });

  it('a MANAGER of another project cannot update', async () => {
    const task = taskDoc();
    primeContext(task);
    await expect(taskService.updateTask(otherManager, taskId, { title: 'x' })).rejects.toMatchObject({ statusCode: 403 });
    expect(task.save).not.toHaveBeenCalled();
  });

  it('ADMIN completing a task stamps completedAt; reopening clears it', async () => {
    const task = taskDoc();
    primeContext(task);
    primePopulatedResult();
    await taskService.updateTask(admin, taskId, { status: 'COMPLETED' });
    expect(task.status).toBe('COMPLETED');
    expect(task.completedAt).toBeInstanceOf(Date);

    primeContext(task);
    primePopulatedResult();
    await taskService.updateTask(admin, taskId, { status: 'IN_PROGRESS' });
    expect(task.completedAt).toBeNull();
  });

  it('manager can clear the due date and unassign', async () => {
    const task = taskDoc({ dueDate: new Date() });
    primeContext(task);
    primePopulatedResult();
    await taskService.updateTask(manager, taskId, { dueDate: null, assignedTo: null });
    expect(task.dueDate).toBeNull();
    expect(task.assignedTo).toBeNull();
  });

  it('manager reassignment is validated (inactive employee rejected)', async () => {
    const task = taskDoc();
    primeContext(task);
    mockedEmployee.findById.mockReturnValueOnce(chainable({ _id: memberEmpId, isActive: false }));
    await expect(
      taskService.updateTask(manager, taskId, { assignedTo: memberEmpId.toString() }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(task.save).not.toHaveBeenCalled();
  });

  it('assignee can move their task TODO -> IN_PROGRESS and edit description', async () => {
    const task = taskDoc();
    primeContext(task);
    primeAssigneeLookup(memberEmpId);
    primePopulatedResult();
    await taskService.updateTask(assignee, taskId, { status: 'IN_PROGRESS', description: 'Working on it' });
    expect(task.status).toBe('IN_PROGRESS');
    expect(task.description).toBe('Working on it');
  });

  it('assignee cannot mark their task COMPLETED directly', async () => {
    const task = taskDoc({ status: 'IN_PROGRESS' });
    primeContext(task);
    primeAssigneeLookup(memberEmpId);
    await expect(taskService.updateTask(assignee, taskId, { status: 'COMPLETED' })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(task.save).not.toHaveBeenCalled();
  });

  it('assignee cannot change priority, due date, tags, title or assignment', async () => {
    const task = taskDoc();
    primeContext(task);
    primeAssigneeLookup(memberEmpId);
    await expect(
      taskService.updateTask(assignee, taskId, { priority: 'LOW', assignedTo: otherEmpId.toString() }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(task.save).not.toHaveBeenCalled();
    expect(task.priority).toBe('MEDIUM');
  });

  it("an employee cannot update someone else's task", async () => {
    const task = taskDoc();
    primeContext(task);
    primeAssigneeLookup(otherEmpId);
    await expect(taskService.updateTask(stranger, taskId, { status: 'IN_PROGRESS' })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('404s when the task does not exist', async () => {
    mockedTask.findById.mockResolvedValueOnce(null as never);
    await expect(taskService.updateTask(admin, taskId, { title: 'x' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('404s when the task points at a project that no longer exists', async () => {
    mockedTask.findById.mockResolvedValueOnce(taskDoc() as never);
    mockedProject.findById.mockReturnValueOnce(chainable(null));
    await expect(taskService.updateTask(admin, taskId, { title: 'x' })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('assignTask', () => {
  it('manager can assign an active project member', async () => {
    const task = taskDoc({ assignedTo: null });
    primeContext(task);
    mockedEmployee.findById.mockReturnValueOnce(chainable({ _id: memberEmpId, isActive: true }));
    primePopulatedResult();
    await taskService.assignTask(manager, taskId, memberEmpId.toString());
    expect(task.assignedTo).toBe(memberEmpId);
  });

  it('an assignee cannot reassign themselves or others', async () => {
    const task = taskDoc();
    primeContext(task);
    primeAssigneeLookup(memberEmpId);
    await expect(taskService.assignTask(assignee, taskId, otherEmpId.toString())).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(task.save).not.toHaveBeenCalled();
  });

  it('another MANAGER cannot assign', async () => {
    primeContext(taskDoc());
    await expect(taskService.assignTask(otherManager, taskId, memberEmpId.toString())).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('rejects a non-member employee', async () => {
    primeContext(taskDoc());
    mockedEmployee.findById.mockReturnValueOnce(chainable({ _id: otherEmpId, isActive: true }));
    await expect(taskService.assignTask(admin, taskId, otherEmpId.toString())).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('updateTaskStatus', () => {
  it('manager may move a task to any status', async () => {
    const task = taskDoc({ status: 'REVIEW' });
    primeContext(task);
    primePopulatedResult();
    await taskService.updateTaskStatus(manager, taskId, 'COMPLETED');
    expect(task.status).toBe('COMPLETED');
  });

  it.each([
    ['TODO', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'REVIEW'],
    ['IN_PROGRESS', 'BLOCKED'],
    ['BLOCKED', 'IN_PROGRESS'],
  ])('assignee may move %s -> %s', async (from, to) => {
    const task = taskDoc({ status: from });
    primeContext(task);
    primeAssigneeLookup(memberEmpId);
    primePopulatedResult();
    await taskService.updateTaskStatus(assignee, taskId, to as never);
    expect(task.status).toBe(to);
  });

  it.each([
    ['TODO', 'COMPLETED'],
    ['TODO', 'REVIEW'],
    ['REVIEW', 'COMPLETED'],
    ['COMPLETED', 'IN_PROGRESS'],
  ])('assignee may NOT move %s -> %s', async (from, to) => {
    const task = taskDoc({ status: from });
    primeContext(task);
    primeAssigneeLookup(memberEmpId);
    await expect(taskService.updateTaskStatus(assignee, taskId, to as never)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('an unrelated employee cannot change status', async () => {
    primeContext(taskDoc());
    primeAssigneeLookup(otherEmpId);
    await expect(taskService.updateTaskStatus(stranger, taskId, 'IN_PROGRESS')).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('deleteTask (deletion rules)', () => {
  it("the project's MANAGER can delete an open task", async () => {
    primeContext(taskDoc());
    mockedTask.deleteOne.mockResolvedValueOnce({} as never);
    await taskService.deleteTask(manager, taskId);
    expect(mockedTask.deleteOne).toHaveBeenCalledTimes(1);
  });

  it('ADMIN can delete any task, including a completed one', async () => {
    primeContext(taskDoc({ status: 'COMPLETED' }));
    mockedTask.deleteOne.mockResolvedValueOnce({} as never);
    await taskService.deleteTask(admin, taskId);
    expect(mockedTask.deleteOne).toHaveBeenCalledTimes(1);
  });

  it('a MANAGER cannot delete a completed task (kept as history)', async () => {
    primeContext(taskDoc({ status: 'COMPLETED' }));
    await expect(taskService.deleteTask(manager, taskId)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockedTask.deleteOne).not.toHaveBeenCalled();
  });

  it('another MANAGER cannot delete', async () => {
    primeContext(taskDoc());
    await expect(taskService.deleteTask(otherManager, taskId)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('an assignee cannot delete their own task', async () => {
    primeContext(taskDoc());
    primeAssigneeLookup(memberEmpId);
    await expect(taskService.deleteTask(assignee, taskId)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockedTask.deleteOne).not.toHaveBeenCalled();
  });

  it('404s when the task does not exist', async () => {
    mockedTask.findById.mockResolvedValueOnce(null as never);
    await expect(taskService.deleteTask(admin, taskId)).rejects.toMatchObject({ statusCode: 404 });
  });
});
