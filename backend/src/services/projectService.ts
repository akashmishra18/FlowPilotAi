import { Types } from 'mongoose';
import { ProjectModel, ProjectDocument } from '../models/Project';
import { EmployeeModel } from '../models/Employee';
import { UserModel } from '../models/User';
import { AppError } from '../utils/AppError';
import { escapeRegex } from '../utils/regex';
import { Role, ProjectStatus, ProjectPriority } from '../config/constants';

interface RequestingUser {
  id: string;
  role: Role;
}

interface CreateProjectInput {
  name: string;
  projectCode: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  clientName?: string;
  startDate: string | Date;
  deadline?: string | Date | null;
  managerId: string;
  members?: string[];
  createdBy: string;
}

interface ListProjectsQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  managerId?: string;
  isActive?: boolean;
}

/** Public-safe shape of a User, for embedding as a project's manager. */
const PUBLIC_USER_FIELDS = 'name email role isActive';
/** Public-safe shape of an Employee, for embedding as a project member. */
const PUBLIC_EMPLOYEE_FIELDS = 'employeeId department designation isActive';

const MANAGER_ELIGIBLE_ROLES: Role[] = ['ADMIN', 'MANAGER'];

/**
 * Only these fields are ever written by PATCH /api/projects/:id. status,
 * managerId, members, and isActive all have their own dedicated endpoints
 * with their own authorization/validation rules, so they're deliberately
 * excluded here — this is what actually prevents, e.g., a MANAGER from
 * smuggling a status change or a member change into a generic update.
 */
const UPDATABLE_PROJECT_FIELDS = ['name', 'description', 'priority', 'clientName', 'startDate', 'deadline'] as const;
type UpdatableProjectField = (typeof UPDATABLE_PROJECT_FIELDS)[number];

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

/**
 * ADMIN may manage any project. MANAGER may manage only the project(s)
 * they are assigned to manage. This is the ownership check the route-level
 * `requireRole('ADMIN', 'MANAGER')` cannot express on its own, since it
 * depends on which specific project is being touched.
 */
function assertCanManageProject(requestingUser: RequestingUser, project: ProjectDocument): void {
  if (requestingUser.role === 'ADMIN') return;
  if (requestingUser.role === 'MANAGER' && project.managerId.toString() === requestingUser.id) return;
  throw new AppError('You do not have permission to manage this project', 403);
}

async function assertCanViewProject(
  requestingUser: RequestingUser,
  project: { managerId: unknown; members: unknown[] },
): Promise<void> {
  if (requestingUser.role === 'ADMIN') return;

  if (requestingUser.role === 'MANAGER') {
    if (extractId(project.managerId) === requestingUser.id) return;
    throw new AppError('You do not have permission to view this project', 403);
  }

  // TEAM_LEAD / EMPLOYEE: viewable only if their Employee record is a member.
  const employee = await EmployeeModel.findOne({ userId: requestingUser.id }).select('_id').lean();
  const employeeId = employee ? String(employee._id) : null;
  const memberIds = project.members.map((m) => extractId(m));

  if (employeeId && memberIds.includes(employeeId)) return;
  throw new AppError('You do not have permission to view this project', 403);
}

async function resolveAndValidateMembers(memberIds: string[]): Promise<Types.ObjectId[]> {
  const unique = Array.from(new Set(memberIds));
  unique.forEach((id) => assertValidObjectId(id, 'members'));
  if (unique.length === 0) return [];

  const employees = await EmployeeModel.find({ _id: { $in: unique } })
    .select('_id isActive')
    .lean();
  const foundIds = new Set(employees.map((e) => String(e._id)));

  const missing = unique.find((id) => !foundIds.has(id));
  if (missing) {
    throw new AppError(`No employee found with id ${missing}`, 400);
  }

  const inactive = employees.some((e) => !e.isActive);
  if (inactive) {
    throw new AppError('Inactive employees cannot be added as project members', 400);
  }

  return employees.map((e) => e._id as Types.ObjectId);
}

async function assertValidManager(managerId: string): Promise<void> {
  assertValidObjectId(managerId, 'managerId');
  const manager = await UserModel.findById(managerId).select('role').lean();
  if (!manager) {
    throw new AppError('No user found with the provided managerId', 400);
  }
  if (!MANAGER_ELIGIBLE_ROLES.includes(manager.role)) {
    throw new AppError('The assigned manager must have the MANAGER or ADMIN role', 400);
  }
}

function assertDeadlineNotBeforeStart(startDate: unknown, deadline: unknown): void {
  if (!startDate || !deadline) return;
  if (new Date(deadline as string) < new Date(startDate as string)) {
    throw new AppError('endDate cannot be before startDate', 400);
  }
}

export async function createProject(input: CreateProjectInput): Promise<ProjectDocument> {
  await assertValidManager(input.managerId);

  const existingByCode = await ProjectModel.findOne({ projectCode: input.projectCode.toUpperCase() });
  if (existingByCode) {
    throw new AppError('This project code is already in use', 409);
  }

  assertDeadlineNotBeforeStart(input.startDate, input.deadline);
  const memberIds = await resolveAndValidateMembers(input.members ?? []);

  const project = await ProjectModel.create({
    name: input.name,
    projectCode: input.projectCode,
    description: input.description ?? '',
    status: input.status ?? 'PLANNING',
    priority: input.priority ?? 'MEDIUM',
    clientName: input.clientName ?? '',
    startDate: input.startDate,
    deadline: input.deadline ?? null,
    managerId: input.managerId,
    members: memberIds,
    createdBy: input.createdBy,
  });

  return project;
}

/**
 * Visibility is scoped by role independently of whatever filters are
 * passed in — a MANAGER's `managerId` filter is always forced to their own
 * id, and an EMPLOYEE/TEAM_LEAD's results are always restricted to
 * projects where their Employee record appears in `members`. This means a
 * crafted query string can never be used to see projects outside scope.
 */
export async function getProjects(requestingUser: RequestingUser, filters: ListProjectsQuery) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};

  if (filters.status) query.status = filters.status;
  if (filters.priority) query.priority = filters.priority;
  if (typeof filters.isActive === 'boolean') query.isActive = filters.isActive;
  if (filters.managerId) {
    assertValidObjectId(filters.managerId, 'managerId');
    query.managerId = filters.managerId;
  }
  if (filters.search) {
    const regex = new RegExp(escapeRegex(filters.search), 'i');
    query.$or = [{ name: regex }, { projectCode: regex }, { clientName: regex }];
  }

  if (requestingUser.role === 'MANAGER') {
    query.managerId = requestingUser.id;
  } else if (requestingUser.role !== 'ADMIN') {
    const employee = await EmployeeModel.findOne({ userId: requestingUser.id }).select('_id').lean();
    if (!employee) {
      return { projects: [], pagination: { page, limit, total: 0, totalPages: 1 } };
    }
    query.members = employee._id;
  }

  const [projects, total] = await Promise.all([
    ProjectModel.find(query)
      .populate('managerId', PUBLIC_USER_FIELDS)
      .populate('members', PUBLIC_EMPLOYEE_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ProjectModel.countDocuments(query),
  ]);

  return {
    projects,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function getProjectById(requestingUser: RequestingUser, id: string) {
  assertValidObjectId(id);

  const project = await ProjectModel.findById(id)
    .populate('managerId', PUBLIC_USER_FIELDS)
    .populate('members', PUBLIC_EMPLOYEE_FIELDS)
    .lean();

  if (!project) {
    throw new AppError('Project not found', 404);
  }

  await assertCanViewProject(requestingUser, project);

  return project;
}

export async function updateProject(
  requestingUser: RequestingUser,
  id: string,
  updates: Partial<Record<UpdatableProjectField, unknown>>,
): Promise<ProjectDocument> {
  assertValidObjectId(id);

  const project = await ProjectModel.findById(id);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  assertCanManageProject(requestingUser, project);

  const nextStart = updates.startDate ?? project.startDate;
  const nextDeadline = updates.deadline ?? project.deadline;
  assertDeadlineNotBeforeStart(nextStart, nextDeadline);

  for (const field of UPDATABLE_PROJECT_FIELDS) {
    if (updates[field] !== undefined) {
      (project as unknown as Record<string, unknown>)[field] = updates[field];
    }
  }

  await project.save();
  return project;
}

export async function updateProjectStatus(
  requestingUser: RequestingUser,
  id: string,
  status: ProjectStatus,
): Promise<ProjectDocument> {
  assertValidObjectId(id);

  const project = await ProjectModel.findById(id);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  assertCanManageProject(requestingUser, project);

  project.status = status;
  await project.save();
  return project;
}

/**
 * Reassigning a project's manager is ADMIN-only at the route level (not
 * MANAGER-if-own), since it's an ownership change rather than day-to-day
 * project management — a MANAGER should not be able to hand their project
 * to someone else, or claim a project they don't already manage.
 */
export async function assignManager(id: string, newManagerId: string): Promise<ProjectDocument> {
  assertValidObjectId(id);
  await assertValidManager(newManagerId);

  const project = await ProjectModel.findById(id);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  project.managerId = new Types.ObjectId(newManagerId);
  await project.save();
  return project;
}

export async function addMember(
  requestingUser: RequestingUser,
  id: string,
  employeeId: string,
): Promise<ProjectDocument> {
  assertValidObjectId(id);
  assertValidObjectId(employeeId, 'employeeId');

  const project = await ProjectModel.findById(id);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  assertCanManageProject(requestingUser, project);

  const employee = await EmployeeModel.findById(employeeId).select('_id isActive').lean();
  if (!employee) {
    throw new AppError('No employee found with the provided id', 400);
  }
  if (!employee.isActive) {
    throw new AppError('Inactive employees cannot be added as project members', 400);
  }

  const alreadyMember = project.members.some((memberId) => memberId.toString() === employeeId);
  if (alreadyMember) {
    throw new AppError('This employee is already a member of the project', 409);
  }

  project.members.push(employee._id as Types.ObjectId);
  await project.save();
  return project;
}

export async function removeMember(
  requestingUser: RequestingUser,
  id: string,
  employeeId: string,
): Promise<ProjectDocument> {
  assertValidObjectId(id);
  assertValidObjectId(employeeId, 'employeeId');

  const project = await ProjectModel.findById(id);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  assertCanManageProject(requestingUser, project);

  const originalLength = project.members.length;
  project.members = project.members.filter((memberId) => memberId.toString() !== employeeId) as Types.ObjectId[];

  if (project.members.length === originalLength) {
    throw new AppError('This employee is not a member of the project', 404);
  }

  await project.save();
  return project;
}

export async function deactivateProject(id: string): Promise<ProjectDocument> {
  assertValidObjectId(id);

  const project = await ProjectModel.findById(id);
  if (!project) {
    throw new AppError('Project not found', 404);
  }
  if (!project.isActive) {
    throw new AppError('Project is already inactive', 400);
  }

  project.isActive = false;
  await project.save();
  return project;
}
