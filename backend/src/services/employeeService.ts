import mongoose, { PipelineStage, Types } from 'mongoose';
import { EmployeeModel, EmployeeDocument } from '../models/Employee';
import { UserModel } from '../models/User';
import { AppError } from '../utils/AppError';
import { escapeRegex } from '../utils/regex';
import { Role } from '../config/constants';
import { ProjectModel } from '../models/Project';
import { TaskModel } from '../models/Task';
import { recordAuditEvent, recordAuditFailure } from './auditService';
import { env } from '../config/env';

interface RequestingUser {
  id: string;
  role: Role;
}

interface CreateEmployeeInput {
  userId: string;
  employeeId: string;
  department: string;
  designation: string;
  phone?: string;
  joinedAt: string | Date;
  managerId?: string | null;
}

interface ListEmployeesQuery {
  page?: number;
  limit?: number;
  department?: string;
  designation?: string;
  isActive?: boolean;
  search?: string;
}

/** Public-safe shape of a User, for embedding alongside an Employee record. */
const PUBLIC_USER_FIELDS = 'name email role isActive';

function assertValidObjectId(id: string, label = 'id'): void {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label}`, 400);
  }
}

/**
 * Only these fields are ever written by PATCH /api/employees/:id. Anything
 * else in the request body (isActive, userId, employeeId, role, etc.) is
 * silently ignored here rather than passed through — this is what actually
 * prevents mass-assignment into protected fields, not just documentation.
 */
const UPDATABLE_FIELDS = ['department', 'designation', 'phone', 'joinedAt', 'managerId', 'skills'] as const;
type UpdatableField = (typeof UPDATABLE_FIELDS)[number];

async function getRequesterEmployeeId(requestingUser: RequestingUser): Promise<Types.ObjectId> {
  const requester = await EmployeeModel.findOne({ userId: requestingUser.id }).select('_id').lean();
  if (!requester) {
    throw new AppError('No employee profile exists for this account', 403);
  }
  return requester._id as Types.ObjectId;
}

function assertRole(requestingUser: RequestingUser, ...allowedRoles: Role[]): void {
  if (!allowedRoles.includes(requestingUser.role)) {
    throw new AppError('You do not have permission to perform this action', 403);
  }
}

async function assertMutationRole(requestingUser: RequestingUser, targetId: string, ...allowedRoles: Role[]): Promise<void> {
  if (allowedRoles.includes(requestingUser.role)) return;
  await recordAuditFailure({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'EMPLOYEE_MUTATION_UNAUTHORIZED', targetType: 'Employee', targetId, error: { code: '403', message: 'Unauthorized employee mutation' } });
  throw new AppError('You do not have permission to perform this action', 403);
}

async function assertCanAccessEmployee(
  requestingUser: RequestingUser,
  employee: { userId: Types.ObjectId; managerId?: Types.ObjectId | null },
): Promise<void> {
  if (requestingUser.role === 'ADMIN') return;

  if (employee.userId.toString() === requestingUser.id) return;

  if (requestingUser.role === 'MANAGER' || requestingUser.role === 'TEAM_LEAD') {
    const requesterEmployeeId = await getRequesterEmployeeId(requestingUser);
    if (employee.managerId?.toString() === requesterEmployeeId.toString()) return;
  }

  throw new AppError('You do not have permission to view this employee', 403);
}

async function assertValidManagerEmployee(managerId: string, employeeId?: string, actor?: RequestingUser): Promise<void> {
  const fail = async (message: string, code = 400): Promise<never> => {
    if (actor) await recordAuditFailure({ actorUserId: actor.id, actorRole: actor.role, action: 'EMPLOYEE_MANAGER_ASSIGNMENT_FAILED', targetType: 'Employee', targetId: employeeId ?? managerId, error: { code: String(code), message } });
    throw new AppError(message, code);
  };
  if (!Types.ObjectId.isValid(managerId)) return fail('Invalid managerId');
  if (employeeId && managerId === employeeId) return fail('An employee cannot be their own manager');
  const manager = await EmployeeModel.findById(managerId).lean();
  if (!manager) return fail('No employee found with the provided managerId');
  if (manager.isActive === false) return fail('An inactive employee cannot be assigned as a manager');
  const managerUser = await UserModel.findById(manager.userId).select('role isActive').lean();
  if (!managerUser || managerUser.isActive === false || !['ADMIN', 'MANAGER', 'TEAM_LEAD'].includes(managerUser.role)) return fail('The assigned manager must be an active manager or team lead');

  // Walk the chain to prevent indirect cycles (A -> B -> A).
  const seen = new Set<string>(employeeId ? [employeeId] : []);
  let current: string | null = managerId;
  while (current) {
    if (seen.has(current)) return fail('Manager assignment would create a reporting cycle');
    seen.add(current);
    const parent = (await EmployeeModel.findById(current).select('managerId').lean()) as { managerId?: Types.ObjectId | null } | null;
    current = parent?.managerId ? String(parent.managerId) : null;
  }
}

export async function createEmployee(requestingUser: RequestingUser, input: CreateEmployeeInput): Promise<EmployeeDocument> {
  await assertMutationRole(requestingUser, input.userId, 'ADMIN');
  assertValidObjectId(input.userId, 'userId');

  const user = await UserModel.findById(input.userId);
  if (!user) {
    throw new AppError('No user found with the provided userId', 400);
  }
  if (user.isActive === false) throw new AppError('An inactive user cannot receive an employee profile', 400);

  const [existingByUser, existingByEmployeeId] = await Promise.all([
    EmployeeModel.findOne({ userId: input.userId }),
    EmployeeModel.findOne({ employeeId: input.employeeId }),
  ]);

  if (existingByUser) {
    throw new AppError('This user already has an employee profile', 409);
  }
  if (existingByEmployeeId) {
    throw new AppError('This employee ID is already in use', 409);
  }

  if (input.managerId) {
    await assertValidManagerEmployee(input.managerId, undefined, requestingUser);
  }

  const employee = await EmployeeModel.create({
    userId: input.userId,
    employeeId: input.employeeId,
    department: input.department,
    designation: input.designation,
    phone: input.phone ?? null,
    joinedAt: input.joinedAt,
    managerId: input.managerId || null,
  });

  await recordAuditEvent({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'EMPLOYEE_CREATED', targetType: 'Employee', targetId: employee._id.toString(), outcome: 'SUCCESS', after: { employeeId: employee.employeeId, userId: employee.userId, managerId: employee.managerId } });

  return employee;
}

/**
 * Employee data never duplicates name/email — they live only on User. A
 * `$lookup` joins them in for the list/detail views, but the lookup's own
 * sub-pipeline projects only `PUBLIC_USER_FIELDS`, so passwordHash never
 * enters the aggregation output in the first place (schema-level
 * `select: false` does not apply to raw aggregation pipelines, so this
 * projection is the thing actually guaranteeing it isn't leaked here).
 */
export async function getEmployees(requestingUser: RequestingUser, filters: ListEmployeesQuery) {
  assertRole(requestingUser, 'ADMIN', 'MANAGER');
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;

  const match: Record<string, unknown> = {};
  if (requestingUser.role === 'MANAGER') {
    match.managerId = await getRequesterEmployeeId(requestingUser);
  }
  if (filters.department) match.department = filters.department;
  if (filters.designation) match.designation = filters.designation;
  if (typeof filters.isActive === 'boolean') match.isActive = filters.isActive;

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $lookup: {
        from: 'users',
        let: { userId: '$userId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
          { $project: { name: 1, email: 1, role: 1, isActive: 1 } },
        ],
        as: 'user',
      },
    },
    { $unwind: '$user' },
  ];

  if (filters.search) {
    const regex = new RegExp(escapeRegex(filters.search), 'i');
    pipeline.push({
      $match: {
        $or: [{ employeeId: regex }, { 'user.name': regex }, { 'user.email': regex }],
      },
    });
  }

  pipeline.push(
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        totalCount: [{ $count: 'count' }],
      },
    },
  );

  const [result] = await EmployeeModel.aggregate(pipeline);
  const employees = result?.data ?? [];
  const total: number = result?.totalCount?.[0]?.count ?? 0;

  return {
    employees,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function getEmployeeById(requestingUser: RequestingUser, id: string) {
  assertValidObjectId(id);

  const employee = await EmployeeModel.findById(id).lean();
  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  await assertCanAccessEmployee(requestingUser, employee);
  const user = await UserModel.findById(employee.userId).select(PUBLIC_USER_FIELDS).lean();
  if (!user) {
    throw new AppError('Associated user account not found', 404);
  }

  return { ...employee, user };
}

export async function getCurrentEmployeeProfile(requestingUser: RequestingUser) {
  const employee = await EmployeeModel.findOne({ userId: requestingUser.id }).lean();
  if (!employee) {
    throw new AppError('No employee profile exists for this account yet', 404);
  }

  const user = await UserModel.findById(requestingUser.id).select(PUBLIC_USER_FIELDS).lean();
  return { ...employee, user };
}

export async function updateEmployee(
  requestingUser: RequestingUser,
  id: string,
  updates: Partial<Record<UpdatableField, unknown>>,
): Promise<EmployeeDocument> {
  await assertMutationRole(requestingUser, id, 'ADMIN', 'MANAGER');
  assertValidObjectId(id);

  const employee = await EmployeeModel.findById(id);
  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  await assertCanAccessEmployee(requestingUser, employee);
  const before = { department: employee.department, designation: employee.designation, managerId: employee.managerId };

  if (updates.managerId !== undefined && requestingUser.role !== 'ADMIN') {
    throw new AppError('Only an admin can change an employee manager', 403);
  }

  if (updates.managerId) {
    const managerId = String(updates.managerId);
    await assertValidManagerEmployee(managerId, id, requestingUser);
  }

  for (const field of UPDATABLE_FIELDS) {
    if (updates[field] !== undefined) {
      (employee as unknown as Record<string, unknown>)[field] = updates[field];
    }
  }

  await employee.save();
  await recordAuditEvent({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: updates.managerId !== undefined ? 'EMPLOYEE_MANAGER_CHANGED' : 'EMPLOYEE_UPDATED', targetType: 'Employee', targetId: id, outcome: 'SUCCESS', before, after: { department: employee.department, designation: employee.designation, managerId: employee.managerId } });
  return employee;
}

export async function updateEmployeeStatus(
  requestingUser: RequestingUser,
  id: string,
  isActive: boolean,
): Promise<EmployeeDocument> {
  await assertMutationRole(requestingUser, id, 'ADMIN');
  assertValidObjectId(id);

  const employee = await EmployeeModel.findById(id);
  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  if (employee.userId.toString() === requestingUser.id) {
    throw new AppError('You cannot change your own active status', 400);
  }

  const applyChanges = async (session?: mongoose.ClientSession) => {
    const before = { isActive: Boolean(employee.isActive), userId: employee.userId };
    employee.isActive = isActive;
    if (session) await EmployeeModel.updateOne({ _id: employee._id }, { $set: { isActive } }, { session });
    else await employee.save();
    if (session) await UserModel.updateOne({ _id: employee.userId }, { $set: { isActive } }, { session });
    else await UserModel.updateOne({ _id: employee.userId }, { $set: { isActive } });

    if (!isActive) {
      // Preserve task history, but remove invalid active relationships.
      if (session) {
        await TaskModel.updateMany({ assignedTo: employee._id }, { $set: { assignedTo: null } }, { session });
        await ProjectModel.updateMany({ members: employee._id }, { $pull: { members: employee._id } }, { session });
      } else {
        await TaskModel.updateMany({ assignedTo: employee._id }, { $set: { assignedTo: null } });
        await ProjectModel.updateMany({ members: employee._id }, { $pull: { members: employee._id } });
      }
    }
    await recordAuditEvent({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: isActive ? 'EMPLOYEE_ACTIVATED' : 'EMPLOYEE_DEACTIVATED', targetType: 'Employee', targetId: id, outcome: 'SUCCESS', before, after: { isActive, userId: employee.userId } }, session);
  };

  if (mongoose.connection.readyState !== 1 && env.nodeEnv === 'test') {
    await applyChanges();
  } else if (mongoose.connection.readyState !== 1) {
    throw new AppError('Transactional employee lifecycle operation is unavailable', 503);
  } else {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(() => applyChanges(session));
    } finally {
      await session.endSession();
    }
  }

  return employee;
}
