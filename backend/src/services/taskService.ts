import { Types } from 'mongoose';
import { TaskModel, TaskDocument } from '../models/Task';
import { ProjectModel } from '../models/Project';
import { EmployeeModel } from '../models/Employee';
import { AppError } from '../utils/AppError';
import { escapeRegex } from '../utils/regex';
import { Role, TaskPriority, TaskStatus, ASSIGNEE_TASK_TRANSITIONS } from '../config/constants';
import { recordAuditEvent, recordAuditFailure } from './auditService';
import { summarizeOverdueTasks } from '../ai/summarizeOverdueTasks';

interface RequestingUser {
  id: string;
  role: Role;
}

interface CreateTaskInput {
  title: string;
  description?: string;
  projectId: string;
  assignedTo?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string | Date | null;
  tags?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  assignedTo?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string | Date | null;
  tags?: string[];
}

interface ListTasksQuery {
  page?: number;
  limit?: number;
  projectId?: string;
  assignedTo?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDateFrom?: string;
  dueDateTo?: string;
  overdue?: boolean;
  search?: string;
}

/** The only fields an assignee (plain EMPLOYEE/TEAM_LEAD) may touch on their own task. */
const ASSIGNEE_EDITABLE_FIELDS: (keyof UpdateTaskInput)[] = ['status', 'description'];

/** Explicit, safe populate shapes — passwordHash and other auth fields can never be selected. */
const POPULATE_ASSIGNEE = {
  path: 'assignedTo',
  select: 'employeeId department designation isActive userId',
  populate: { path: 'userId', select: 'name email' },
};
const POPULATE_PROJECT = { path: 'projectId', select: 'name projectCode status isActive managerId' };
const POPULATE_CREATOR = { path: 'createdBy', select: 'name email role' };

type Actor = 'privileged' | 'assignee';

interface ProjectContext {
  _id: Types.ObjectId;
  managerId: Types.ObjectId;
  members: Types.ObjectId[];
  isActive: boolean;
}

function assertValidObjectId(id: string, label = 'id'): void {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label}`, 400);
  }
}

/** Extracts a string id whether the field is populated (object) or raw (ObjectId). */
function extractId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && '_id' in (value as Record<string, unknown>)) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}

function parseDate(value: string | Date, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`${label} must be a valid date`, 400);
  }
  return date;
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean)));
}

/**
 * Works out how the requesting user relates to a task:
 * - 'privileged': ADMIN, or the MANAGER of the task's project
 * - 'assignee':   the employee the task is assigned to
 * - null:         no relationship, so no access
 * Both the view check and every mutation derive access from this one
 * function so the rules cannot drift apart.
 */
async function resolveAccess(
  requestingUser: RequestingUser,
  projectManagerId: unknown,
  assignedTo: unknown,
): Promise<Actor | null> {
  if (requestingUser.role === 'ADMIN') return 'privileged';

  if (requestingUser.role === 'MANAGER') {
    return extractId(projectManagerId) === requestingUser.id ? 'privileged' : null;
  }

  const assignedId = extractId(assignedTo);
  if (!assignedId) return null;
  const employee = await EmployeeModel.findOne({ userId: requestingUser.id }).select('_id').lean();
  return employee && String(employee._id) === assignedId ? 'assignee' : null;
}

async function loadTaskContext(id: string): Promise<{ task: TaskDocument; project: ProjectContext }> {
  assertValidObjectId(id);

  const task = await TaskModel.findById(id);
  if (!task) {
    throw new AppError('Task not found', 404);
  }

  const project = (await ProjectModel.findById(task.projectId).select('managerId members isActive').lean()) as
    | ProjectContext
    | null;
  if (!project) {
    throw new AppError('Project not found for this task', 404);
  }

  return { task, project };
}

async function requireActor(
  requestingUser: RequestingUser,
  task: TaskDocument,
  project: ProjectContext,
  action = 'TASK_ACCESS_FAILED',
): Promise<Actor> {
  const actor = await resolveAccess(requestingUser, project.managerId, task.assignedTo);
  if (!actor) {
    await recordAuditFailure({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action, targetType: 'Task', targetId: task._id.toString(), error: { code: '403', message: 'Unauthorized task mutation' } });
    throw new AppError('You do not have permission to modify this task', 403);
  }
  return actor;
}

async function assertActiveProject(project: ProjectContext, requestingUser: RequestingUser, taskId: string): Promise<void> {
  if (!project.isActive) {
    await recordAuditFailure({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_INACTIVE_PROJECT_MUTATION_FAILED', targetType: 'Task', targetId: taskId, error: { code: '400', message: 'Tasks cannot be changed on an inactive project' } });
    throw new AppError('Tasks cannot be changed on an inactive project', 400);
  }
}

async function getPopulatedTask(id: unknown) {
  return TaskModel.findById(id)
    .populate(POPULATE_ASSIGNEE)
    .populate(POPULATE_PROJECT)
    .populate(POPULATE_CREATOR)
    .lean();
}

/**
 * A task may only be assigned to an existing, active employee who is a
 * member of the task's project — the same team the Project model defines.
 */
async function resolveAssignee(project: ProjectContext, employeeId: string, requestingUser?: RequestingUser, taskId = employeeId): Promise<Types.ObjectId> {
  if (!Types.ObjectId.isValid(employeeId)) {
    if (requestingUser) await recordAuditFailure({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_ASSIGNMENT_FAILED', targetType: 'Task', targetId: taskId, error: { code: '400', message: 'Invalid assignedTo' } });
    throw new AppError('Invalid assignedTo', 400);
  }

  const employee = await EmployeeModel.findById(employeeId).select('_id isActive').lean();
  if (!employee) {
    if (requestingUser) await recordAuditFailure({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_ASSIGNMENT_FAILED', targetType: 'Task', targetId: taskId, error: { code: '400', message: 'Employee not found' } });
    throw new AppError('No employee found with the provided assignedTo id', 400);
  }
  if (!employee.isActive) {
    if (requestingUser) await recordAuditFailure({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_ASSIGNMENT_FAILED', targetType: 'Task', targetId: taskId, error: { code: '400', message: 'Inactive employee' } });
    throw new AppError('Inactive employees cannot be assigned tasks', 400);
  }

  const isMember = project.members.some((memberId) => String(memberId) === String(employee._id));
  if (!isMember) {
    if (requestingUser) await recordAuditFailure({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_ASSIGNMENT_FAILED', targetType: 'Task', targetId: taskId, error: { code: '400', message: 'Employee is not a project member' } });
    throw new AppError('The employee must be a member of the project to be assigned its tasks', 400);
  }

  return employee._id as Types.ObjectId;
}

async function applyAssignment(task: TaskDocument, project: ProjectContext, assignedTo: string | null, requestingUser?: RequestingUser): Promise<void> {
  task.assignedTo = assignedTo === null ? null : await resolveAssignee(project, assignedTo, requestingUser, task._id.toString());
}

function applyStatus(task: TaskDocument, status: TaskStatus, actor: Actor): void {
  if (task.status === status) return;

  if (actor === 'assignee' && !ASSIGNEE_TASK_TRANSITIONS[task.status].includes(status)) {
    throw new AppError(`You cannot move a task from ${task.status} to ${status}`, 403);
  }

  task.status = status;
  task.completedAt = status === 'COMPLETED' ? new Date() : null;
}

export async function createTask(requestingUser: RequestingUser, input: CreateTaskInput) {
  assertValidObjectId(input.projectId, 'projectId');

  const project = (await ProjectModel.findById(input.projectId).select('managerId members isActive').lean()) as
    | ProjectContext
    | null;
  if (!project) {
    throw new AppError('No project found with the provided projectId', 400);
  }

  // Only ADMIN or the project's own MANAGER may create tasks on it.
  const actor = await resolveAccess(requestingUser, project.managerId, null);
  if (actor !== 'privileged') {
    throw new AppError('You do not have permission to create tasks for this project', 403);
  }

  if (!project.isActive) {
    throw new AppError('Tasks cannot be created on an inactive project', 400);
  }

  const assignedTo = input.assignedTo ? await resolveAssignee(project, input.assignedTo, requestingUser, input.projectId) : null;
  const status = input.status ?? 'TODO';

  const task = await TaskModel.create({
    title: input.title,
    description: input.description ?? '',
    projectId: project._id,
    assignedTo,
    createdBy: requestingUser.id,
    priority: input.priority ?? 'MEDIUM',
    status,
    dueDate: input.dueDate ? parseDate(input.dueDate, 'dueDate') : null,
    completedAt: status === 'COMPLETED' ? new Date() : null,
    tags: normalizeTags(input.tags ?? []),
  });

  await recordAuditEvent({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_CREATED', targetType: 'Task', targetId: task._id.toString(), outcome: 'SUCCESS', after: { projectId: task.projectId, assignedTo: task.assignedTo, status: task.status } });

  return getPopulatedTask(task._id);
}

/**
 * Visibility is scoped by role regardless of the filters passed in:
 * ADMIN sees everything, a MANAGER only tasks of projects they manage, and
 * everyone else only tasks assigned to their own Employee record. Every
 * filter is a typed, validated value — no request input is ever used as a
 * raw Mongo query fragment.
 */
export async function listTasks(requestingUser: RequestingUser, filters: ListTasksQuery) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;
  const empty = { tasks: [], pagination: { page, limit, total: 0, totalPages: 1 } };

  const conditions: Record<string, unknown>[] = [];

  if (filters.projectId) assertValidObjectId(filters.projectId, 'projectId');
  if (filters.assignedTo) assertValidObjectId(filters.assignedTo, 'assignedTo');

  if (requestingUser.role === 'ADMIN') {
    if (filters.projectId) conditions.push({ projectId: filters.projectId });
    if (filters.assignedTo) conditions.push({ assignedTo: filters.assignedTo });
  } else if (requestingUser.role === 'MANAGER') {
    const managed = await ProjectModel.find({ managerId: requestingUser.id }).select('_id').lean();
    const managedIds = managed.map((p) => String(p._id));
    if (managedIds.length === 0) return empty;

    if (filters.projectId) {
      if (!managedIds.includes(filters.projectId)) return empty;
      conditions.push({ projectId: filters.projectId });
    } else {
      conditions.push({ projectId: { $in: managedIds } });
    }
    if (filters.assignedTo) conditions.push({ assignedTo: filters.assignedTo });
  } else {
    const employee = await EmployeeModel.findOne({ userId: requestingUser.id }).select('_id').lean();
    if (!employee) return empty;
    // An assignee only ever sees their own tasks; any assignedTo filter is overridden.
    conditions.push({ assignedTo: employee._id });
    if (filters.projectId) conditions.push({ projectId: filters.projectId });
  }

  if (filters.status) conditions.push({ status: filters.status });
  if (filters.priority) conditions.push({ priority: filters.priority });

  if (filters.dueDateFrom) conditions.push({ dueDate: { $gte: parseDate(filters.dueDateFrom, 'dueDateFrom') } });
  if (filters.dueDateTo) conditions.push({ dueDate: { $lte: parseDate(filters.dueDateTo, 'dueDateTo') } });

  if (filters.overdue === true) {
    conditions.push({ dueDate: { $lt: new Date() }, status: { $ne: 'COMPLETED' } });
  } else if (filters.overdue === false) {
    conditions.push({
      $or: [{ dueDate: null }, { dueDate: { $gte: new Date() } }, { status: 'COMPLETED' }],
    });
  }

  if (filters.search) {
    const regex = new RegExp(escapeRegex(filters.search), 'i');
    conditions.push({ $or: [{ title: regex }, { description: regex }, { tags: regex }] });
  }

  const query = conditions.length > 0 ? { $and: conditions } : {};

  const [tasks, total] = await Promise.all([
    TaskModel.find(query)
      .populate(POPULATE_ASSIGNEE)
      .populate(POPULATE_PROJECT)
      .populate(POPULATE_CREATOR)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TaskModel.countDocuments(query),
  ]);

  return {
    tasks,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/**
 * Bounded assistant data source. It reuses the existing role-scoped task
 * query before passing any task data to the configured summary provider.
 */
export async function getOverdueTaskAssistant(requestingUser: RequestingUser, requestId?: string) {
  const result = await listTasks(requestingUser, { overdue: true, limit: 100, page: 1 });
  const tasks = result.tasks.map((task) => {
    const record = task as unknown as { _id: unknown; title: string; projectId?: unknown; assignedTo?: unknown; dueDate: string | null; status: string };
    const project = record.projectId && typeof record.projectId === 'object' ? record.projectId as Record<string, unknown> : null;
    const assignee = record.assignedTo && typeof record.assignedTo === 'object' ? record.assignedTo as Record<string, unknown> : null;
    const assigneeUser = assignee?.userId && typeof assignee.userId === 'object' ? assignee.userId as Record<string, unknown> : null;
    return {
      id: String(record._id),
      title: record.title,
      project: project ? { id: String(project._id), name: String(project.name ?? ''), projectCode: String(project.projectCode ?? '') } : null,
      assignedEmployee: assignee
        ? { id: String(assignee._id), employeeId: String(assignee.employeeId ?? ''), name: assigneeUser?.name ? String(assigneeUser.name) : null }
        : null,
      dueDate: record.dueDate,
      status: record.status,
    };
  });

  const summary = await summarizeOverdueTasks(tasks, undefined, { userId: requestingUser.id, requestId: requestId ?? `overdue-assistant-${requestingUser.id}-${Date.now()}` });
  return { ...summary, tasks, total: result.pagination.total };
}

/** Validates a reassignment proposal without changing the task. */
export async function validateReassignmentRequest(requestingUser: RequestingUser, taskId: string, assignedTo: string) {
  const { task, project } = await loadTaskContext(taskId);
  const actor = await resolveAccess(requestingUser, project.managerId, task.assignedTo);
  if (!actor) {
    await recordAuditFailure({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_REASSIGNMENT_REQUEST_FAILED', targetType: 'Task', targetId: taskId, error: { code: '403', message: 'Requester cannot access this task' } });
    throw new AppError('You do not have permission to request a change for this task', 403);
  }
  await assertActiveProject(project, requestingUser, taskId);
  const resolved = await resolveAssignee(project, assignedTo, requestingUser, taskId);
  if (String(task.assignedTo ?? '') === String(resolved)) {
    throw new AppError('Task is already assigned to this employee', 400);
  }
  return { taskId: task._id, projectId: project._id, fromAssignedTo: task.assignedTo, assignedTo: resolved };
}

export async function getTaskById(requestingUser: RequestingUser, id: string) {
  assertValidObjectId(id);

  const task = await TaskModel.findById(id)
    .populate(POPULATE_ASSIGNEE)
    .populate(POPULATE_PROJECT)
    .populate(POPULATE_CREATOR)
    .lean();
  if (!task) {
    throw new AppError('Task not found', 404);
  }

  const project = task.projectId as unknown as { managerId?: unknown } | null;
  const actor = await resolveAccess(requestingUser, project?.managerId, task.assignedTo);
  if (!actor) {
    throw new AppError('You do not have permission to view this task', 403);
  }

  return task;
}

/**
 * ADMIN / the project's MANAGER may change any editable field.
 * An assignee may change only `status` (within ASSIGNEE_TASK_TRANSITIONS)
 * and `description`; attempting anything else is rejected outright rather
 * than silently ignored, so a client can't believe a protected change
 * succeeded. projectId and createdBy are never updatable by anyone.
 */
export async function updateTask(requestingUser: RequestingUser, id: string, updates: UpdateTaskInput) {
  const { task, project } = await loadTaskContext(id);
  const actor = await requireActor(requestingUser, task, project, 'TASK_MUTATION_UNAUTHORIZED');
  await assertActiveProject(project, requestingUser, id);
  const before = { status: task.status, assignedTo: task.assignedTo, description: task.description };

  if (actor === 'assignee') {
    const forbidden = (Object.keys(updates) as (keyof UpdateTaskInput)[]).filter(
      (key) => updates[key] !== undefined && !ASSIGNEE_EDITABLE_FIELDS.includes(key),
    );
    if (forbidden.length > 0) {
      throw new AppError(`You are not allowed to change: ${forbidden.join(', ')}`, 403);
    }
  }

  if (updates.title !== undefined) task.title = updates.title;
  if (updates.description !== undefined) task.description = updates.description;
  if (updates.priority !== undefined) task.priority = updates.priority;
  if (updates.tags !== undefined) task.tags = normalizeTags(updates.tags);
  if (updates.dueDate !== undefined) {
    task.dueDate = updates.dueDate === null ? null : parseDate(updates.dueDate, 'dueDate');
  }
  if (updates.assignedTo !== undefined) await applyAssignment(task, project, updates.assignedTo, requestingUser);
  if (updates.status !== undefined) applyStatus(task, updates.status, actor);

  await task.save();
  await recordAuditEvent({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: updates.assignedTo !== undefined ? 'TASK_REASSIGNED' : updates.status !== undefined ? 'TASK_STATUS_CHANGED' : 'TASK_UPDATED', targetType: 'Task', targetId: id, outcome: 'SUCCESS', before, after: { status: task.status, assignedTo: task.assignedTo, description: task.description } });
  return getPopulatedTask(task._id);
}

/** Assigning/reassigning is reserved for ADMIN and the project's MANAGER. */
export async function assignTask(requestingUser: RequestingUser, id: string, assignedTo: string | null, expectedAssignedTo?: string | null) {
  const { task, project } = await loadTaskContext(id);
  const actor = await requireActor(requestingUser, task, project, 'TASK_MUTATION_UNAUTHORIZED');
  if (actor !== 'privileged') {
    throw new AppError('Only an admin or the project manager can assign tasks', 403);
  }
  await assertActiveProject(project, requestingUser, id);
  const currentId = extractId(task.assignedTo);
  await applyAssignment(task, project, assignedTo, requestingUser);

  if (expectedAssignedTo !== undefined) {
    const expectedId = extractId(expectedAssignedTo);
    const targetId = extractId(assignedTo);
    // A retry after a process interruption may find that the previous attempt
    // already applied this exact assignment. Treat it as complete without a
    // second write.
    if (currentId === targetId) return getPopulatedTask(task._id);
    if (currentId !== expectedId) {
      throw new AppError('Task assignment changed after this request was submitted', 409);
    }

    const updated = await TaskModel.findOneAndUpdate(
      { _id: task._id, assignedTo: expectedId ? new Types.ObjectId(expectedId) : null },
      { $set: { assignedTo: task.assignedTo } },
      { new: true },
    );
    if (!updated) {
      // A concurrent safe retry may have won the compare-and-set first.
      const current = await TaskModel.findById(task._id);
      if (extractId(current?.assignedTo) === targetId) return getPopulatedTask(task._id);
      throw new AppError('Task assignment changed while this request was executing', 409);
    }
    await recordAuditEvent({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_REASSIGNED', targetType: 'Task', targetId: id, outcome: 'SUCCESS', before: { assignedTo: expectedAssignedTo }, after: { assignedTo: task.assignedTo } });
    return getPopulatedTask(task._id);
  }

  await task.save();
  await recordAuditEvent({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_REASSIGNED', targetType: 'Task', targetId: id, outcome: 'SUCCESS', after: { assignedTo: task.assignedTo } });
  return getPopulatedTask(task._id);
}

export async function updateTaskStatus(requestingUser: RequestingUser, id: string, status: TaskStatus) {
  const { task, project } = await loadTaskContext(id);
  const actor = await requireActor(requestingUser, task, project, 'TASK_MUTATION_UNAUTHORIZED');
  await assertActiveProject(project, requestingUser, id);

  applyStatus(task, status, actor);
  await task.save();
  await recordAuditEvent({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_STATUS_CHANGED', targetType: 'Task', targetId: id, outcome: 'SUCCESS', after: { status: task.status } });
  return getPopulatedTask(task._id);
}

/**
 * Deletion rules: only ADMIN or the project's MANAGER may delete, an
 * assignee never can, and a COMPLETED task is kept as history — only an
 * ADMIN may remove it.
 */
export async function deleteTask(requestingUser: RequestingUser, id: string): Promise<void> {
  const { task, project } = await loadTaskContext(id);
  const actor = await requireActor(requestingUser, task, project, 'TASK_MUTATION_UNAUTHORIZED');

  if (actor !== 'privileged') {
    throw new AppError('You do not have permission to delete this task', 403);
  }
  if (task.status === 'COMPLETED' && requestingUser.role !== 'ADMIN') {
    throw new AppError('Only an admin can delete a completed task', 403);
  }

  await TaskModel.deleteOne({ _id: task._id });
  await recordAuditEvent({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_DELETED', targetType: 'Task', targetId: id, outcome: 'SUCCESS', before: { status: task.status, projectId: task.projectId } });
}
