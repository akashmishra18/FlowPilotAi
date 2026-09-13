import { PipelineStage, Types } from 'mongoose';
import { EmployeeModel, EmployeeDocument } from '../models/Employee';
import { UserModel } from '../models/User';
import { AppError } from '../utils/AppError';
import { escapeRegex } from '../utils/regex';
import { Role } from '../config/constants';

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

export async function createEmployee(input: CreateEmployeeInput): Promise<EmployeeDocument> {
  assertValidObjectId(input.userId, 'userId');

  const user = await UserModel.findById(input.userId);
  if (!user) {
    throw new AppError('No user found with the provided userId', 400);
  }

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
    assertValidObjectId(input.managerId, 'managerId');
    const manager = await EmployeeModel.findById(input.managerId);
    if (!manager) {
      throw new AppError('No employee found with the provided managerId', 400);
    }
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
export async function getEmployees(filters: ListEmployeesQuery) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;

  const match: Record<string, unknown> = {};
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

  if (requestingUser.role === 'EMPLOYEE' && employee.userId.toString() !== requestingUser.id) {
    throw new AppError('You do not have permission to view this employee', 403);
  }

  const user = await UserModel.findById(employee.userId).select(PUBLIC_USER_FIELDS).lean();
  if (!user) {
    throw new AppError('Associated user account not found', 404);
  }

  return { ...employee, user };
}

export async function getCurrentEmployeeProfile(userId: string) {
  const employee = await EmployeeModel.findOne({ userId }).lean();
  if (!employee) {
    throw new AppError('No employee profile exists for this account yet', 404);
  }

  const user = await UserModel.findById(userId).select(PUBLIC_USER_FIELDS).lean();
  return { ...employee, user };
}

export async function updateEmployee(
  id: string,
  updates: Partial<Record<UpdatableField, unknown>>,
): Promise<EmployeeDocument> {
  assertValidObjectId(id);

  const employee = await EmployeeModel.findById(id);
  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  if (updates.managerId) {
    const managerId = String(updates.managerId);
    assertValidObjectId(managerId, 'managerId');
    if (managerId === id) {
      throw new AppError('An employee cannot be their own manager', 400);
    }
    const manager = await EmployeeModel.findById(managerId);
    if (!manager) {
      throw new AppError('No employee found with the provided managerId', 400);
    }
  }

  for (const field of UPDATABLE_FIELDS) {
    if (updates[field] !== undefined) {
      (employee as unknown as Record<string, unknown>)[field] = updates[field];
    }
  }

  await employee.save();
  return employee;
}

export async function updateEmployeeStatus(
  requestingUser: RequestingUser,
  id: string,
  isActive: boolean,
): Promise<EmployeeDocument> {
  assertValidObjectId(id);

  const employee = await EmployeeModel.findById(id);
  if (!employee) {
    throw new AppError('Employee not found', 404);
  }

  if (employee.userId.toString() === requestingUser.id) {
    throw new AppError('You cannot change your own active status', 400);
  }

  employee.isActive = isActive;
  await employee.save();

  // Keep login ability consistent with employee status: a deactivated
  // employee should not still be able to authenticate into the system.
  await UserModel.updateOne({ _id: employee.userId }, { $set: { isActive } });

  return employee;
}
