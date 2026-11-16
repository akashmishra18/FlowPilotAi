import { Model } from 'mongoose';
import { EmployeeModel } from '../models/Employee';
import { ProjectModel } from '../models/Project';
import { TaskModel } from '../models/Task';
import { TaskReassignmentApprovalModel } from '../models/TaskReassignmentApproval';
import { UserModel } from '../models/User';
import { RefreshTokenModel } from '../models/RefreshToken';
import { hashPassword } from '../utils/password';

export const DEMO_SEED_NAMESPACE = 'flowpilot-local-demo-v1';
const demoKey = (name: string) => `${DEMO_SEED_NAMESPACE}:${name}`;
const DEMO_PREFIX = '[DEMO]';

export interface DemoSeedSafetyOptions {
  nodeEnv?: string;
  mongoUri: string;
  optIn?: string;
  password?: string;
}

export function assertLocalDemoSeedAllowed(options: DemoSeedSafetyOptions): void {
  if (options.nodeEnv === 'production') throw new Error('The local demo seed is disabled in production.');
  if (options.optIn !== 'true') throw new Error('Set ALLOW_LOCAL_DEMO_SEED=true to opt in to the local demo seed.');
  if (!options.password || options.password.length < 12) {
    throw new Error('DEMO_SEED_PASSWORD is required and must be at least 12 characters.');
  }
  assertLocalMongoUri(options.mongoUri);
}

export function assertLocalDemoCleanupAllowed(options: Omit<DemoSeedSafetyOptions, 'password'> & { confirmation?: string }): void {
  if (options.nodeEnv === 'production') throw new Error('Local demo cleanup is disabled in production.');
  if (options.confirmation !== 'DELETE_FLOWPILOT_LOCAL_DEMO') {
    throw new Error('Set CONFIRM_LOCAL_DEMO_CLEANUP=DELETE_FLOWPILOT_LOCAL_DEMO to confirm cleanup.');
  }
  assertLocalMongoUri(options.mongoUri);
}

export function assertLocalMongoUri(uri: string): void {
  let hostname: string;
  try {
    hostname = new URL(uri).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    throw new Error('MONGODB_URI must be a valid local MongoDB URI for demo data commands.');
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error('Demo data commands are restricted to MongoDB on this computer.');
  }
}

type MarkedDocument = { _id: unknown; demoSeedKey?: string; [key: string]: unknown };
export interface DemoSeedModel {
  findOne(filter: Record<string, unknown>): { select(fields: string): { exec(): Promise<MarkedDocument | null> } };
  exists(filter: Record<string, unknown>): PromiseLike<unknown>;
  create(value: Record<string, unknown>): Promise<unknown>;
  find(filter: Record<string, unknown>): { select(fields: string): { lean(): { exec(): Promise<Array<{ _id: unknown }>> } } };
  deleteMany(filter: Record<string, unknown>): Promise<{ deletedCount?: number }>;
}

/** Reuse only records previously created by this seed. Natural-key collisions are never adopted. */
export async function ensureDemoRecord<T>(
  model: Model<T> | DemoSeedModel,
  key: string,
  naturalKeyFilter: Record<string, unknown>,
  createValues: Record<string, unknown>,
  validateExisting?: (record: MarkedDocument) => void,
): Promise<MarkedDocument> {
  const seedModel = model as unknown as DemoSeedModel;
  const marked = await seedModel.findOne({ demoSeedKey: key }).select('+demoSeedKey').exec();
  if (marked) {
    validateExisting?.(marked);
    return marked;
  }

  const collision = await seedModel.exists(naturalKeyFilter);
  if (collision) throw new Error(`A non-demo record already uses a reserved demo identifier (${key}). No data was changed.`);
  return await seedModel.create({ ...createValues, demoSeedKey: key }) as MarkedDocument;
}

function assertAccount(record: MarkedDocument, role: string, label: string): void {
  if (record.role !== role || record.isActive !== true) {
    throw new Error(`The existing ${label} demo account has been changed or deactivated. No existing data was overwritten.`);
  }
}

export async function seedDemoWorkspace(password: string, hash = hashPassword): Promise<{ users: number; employees: number; projects: number; tasks: number; approvals: number }> {
  const admin = await ensureDemoRecord(UserModel, demoKey('user.admin'), { email: 'demo.admin@flowpilot.local' }, {
    name: `${DEMO_PREFIX} Alex Rivera`, email: 'demo.admin@flowpilot.local', role: 'ADMIN', isActive: true, passwordHash: await hash(password),
  }, (record) => assertAccount(record, 'ADMIN', 'admin'));
  const manager = await ensureDemoRecord(UserModel, demoKey('user.manager'), { email: 'demo.manager@flowpilot.local' }, {
    name: `${DEMO_PREFIX} Morgan Lee`, email: 'demo.manager@flowpilot.local', role: 'MANAGER', isActive: true, passwordHash: await hash(password),
  }, (record) => assertAccount(record, 'MANAGER', 'manager'));
  const employeeA = await ensureDemoRecord(UserModel, demoKey('user.employee.a'), { email: 'demo.employee.one@flowpilot.local' }, {
    name: `${DEMO_PREFIX} Jamie Chen`, email: 'demo.employee.one@flowpilot.local', role: 'EMPLOYEE', isActive: true, passwordHash: await hash(password),
  }, (record) => assertAccount(record, 'EMPLOYEE', 'employee one'));
  const employeeB = await ensureDemoRecord(UserModel, demoKey('user.employee.b'), { email: 'demo.employee.two@flowpilot.local' }, {
    name: `${DEMO_PREFIX} Taylor Morgan`, email: 'demo.employee.two@flowpilot.local', role: 'EMPLOYEE', isActive: true, passwordHash: await hash(password),
  }, (record) => assertAccount(record, 'EMPLOYEE', 'employee two'));

  const managerEmployee = await ensureDemoRecord(EmployeeModel, demoKey('employee.manager'), { employeeId: 'DEMO-MGR-001' }, {
    userId: manager._id, employeeId: 'DEMO-MGR-001', department: 'Production', designation: 'Demo Project Manager',
    joinedAt: new Date('2024-01-15T00:00:00.000Z'), managerId: null, skills: ['planning', 'coordination'], isActive: true,
  }, (record) => {
    if (String(record.userId) !== String(manager._id)) throw new Error('The demo manager employee link was modified; refusing to continue.');
  });
  const employeeAProfile = await ensureDemoRecord(EmployeeModel, demoKey('employee.one'), { employeeId: 'DEMO-EMP-001' }, {
    userId: employeeA._id, employeeId: 'DEMO-EMP-001', department: 'Engineering', designation: 'Gameplay Developer',
    joinedAt: new Date('2024-03-04T00:00:00.000Z'), managerId: managerEmployee._id, skills: ['Unity', 'C#'], isActive: true,
  }, (record) => {
    if (String(record.userId) !== String(employeeA._id)) throw new Error('The first demo employee link was modified; refusing to continue.');
  });
  const employeeBProfile = await ensureDemoRecord(EmployeeModel, demoKey('employee.two'), { employeeId: 'DEMO-EMP-002' }, {
    userId: employeeB._id, employeeId: 'DEMO-EMP-002', department: 'Art', designation: 'Technical Artist',
    joinedAt: new Date('2024-05-20T00:00:00.000Z'), managerId: managerEmployee._id, skills: ['Blender', 'Shaders'], isActive: true,
  }, (record) => {
    if (String(record.userId) !== String(employeeB._id)) throw new Error('The second demo employee link was modified; refusing to continue.');
  });

  const projectOne = await ensureDemoRecord(ProjectModel, demoKey('project.starlight'), { projectCode: 'DEMO-STARLIGHT' }, {
    name: `${DEMO_PREFIX} Starlight`, projectCode: 'DEMO-STARLIGHT', description: 'A sample co-op adventure project for demonstrating team workflows.',
    status: 'ACTIVE', priority: 'HIGH', clientName: 'Demo Studio', startDate: new Date('2025-01-06T00:00:00.000Z'),
    deadline: null, managerId: manager._id, members: [managerEmployee._id, employeeAProfile._id, employeeBProfile._id], isActive: true, createdBy: admin._id,
  });
  const projectTwo = await ensureDemoRecord(ProjectModel, demoKey('project.orbit'), { projectCode: 'DEMO-ORBIT' }, {
    name: `${DEMO_PREFIX} Orbit`, projectCode: 'DEMO-ORBIT', description: 'A sample mobile prototype with a small cross-functional team.',
    status: 'PLANNING', priority: 'MEDIUM', clientName: 'Demo Studio', startDate: new Date('2025-02-03T00:00:00.000Z'),
    deadline: null, managerId: manager._id, members: [managerEmployee._id, employeeAProfile._id, employeeBProfile._id], isActive: true, createdBy: admin._id,
  });

  const overdueDate = new Date();
  overdueDate.setDate(overdueDate.getDate() - 4);
  const overdueTask = await ensureDemoRecord(TaskModel, demoKey('task.overdue'), { title: `${DEMO_PREFIX} Review multiplayer reconnect flow` }, {
    title: `${DEMO_PREFIX} Review multiplayer reconnect flow`, description: 'Check reconnection behavior after a short network interruption.',
    projectId: projectOne._id, assignedTo: employeeAProfile._id, createdBy: manager._id, priority: 'HIGH', status: 'IN_PROGRESS',
    dueDate: overdueDate, completedAt: null, tags: ['demo', 'networking'],
  });
  await ensureDemoRecord(TaskModel, demoKey('task.art'), { title: `${DEMO_PREFIX} Polish character lighting pass` }, {
    title: `${DEMO_PREFIX} Polish character lighting pass`, description: 'Review the sample character lighting in the new environment.',
    projectId: projectOne._id, assignedTo: employeeBProfile._id, createdBy: manager._id, priority: 'MEDIUM', status: 'REVIEW',
    dueDate: new Date(Date.now() + 5 * 86400000), completedAt: null, tags: ['demo', 'art'],
  });
  await ensureDemoRecord(TaskModel, demoKey('task.prototype'), { title: `${DEMO_PREFIX} Build onboarding prototype` }, {
    title: `${DEMO_PREFIX} Build onboarding prototype`, description: 'Create a small onboarding flow for the sample mobile prototype.',
    projectId: projectTwo._id, assignedTo: employeeAProfile._id, createdBy: manager._id, priority: 'LOW', status: 'TODO',
    dueDate: new Date(Date.now() + 10 * 86400000), completedAt: null, tags: ['demo', 'prototype'],
  });

  await ensureDemoRecord(TaskReassignmentApprovalModel, demoKey('approval.overdue-task'), { taskId: overdueTask._id, status: 'PENDING' }, {
    taskId: overdueTask._id, projectId: projectOne._id, requestedBy: employeeA._id, requesterRole: 'EMPLOYEE',
    fromAssignedTo: employeeAProfile._id, assignedTo: employeeBProfile._id, status: 'PENDING', reviewedBy: null,
    reviewedAt: null, executionAttemptId: null, executionError: null,
  });

  return { users: 4, employees: 3, projects: 2, tasks: 3, approvals: 1 };
}

export interface DemoCleanupModels {
  users: DemoSeedModel;
  employees: DemoSeedModel;
  projects: DemoSeedModel;
  tasks: DemoSeedModel;
  approvals: DemoSeedModel;
  refreshTokens: DemoSeedModel;
}

const defaultCleanupModels: DemoCleanupModels = {
  users: UserModel as unknown as DemoSeedModel,
  employees: EmployeeModel as unknown as DemoSeedModel,
  projects: ProjectModel as unknown as DemoSeedModel,
  tasks: TaskModel as unknown as DemoSeedModel,
  approvals: TaskReassignmentApprovalModel as unknown as DemoSeedModel,
  // Loaded lazily below to keep seed creation independent of session storage.
  refreshTokens: RefreshTokenModel as unknown as DemoSeedModel,
};

async function markedIds(model: DemoSeedModel): Promise<unknown[]> {
  const docs = await model.find({ demoSeedKey: new RegExp(`^${DEMO_SEED_NAMESPACE}:`) }).select('+demoSeedKey _id').lean().exec();
  return docs.map((doc: { _id: unknown }) => doc._id);
}

async function hasExternalReference(model: DemoSeedModel, filter: Record<string, unknown>): Promise<boolean> {
  return Boolean(await model.exists({ ...filter, demoSeedKey: { $not: new RegExp(`^${DEMO_SEED_NAMESPACE}:`) } }));
}

export async function cleanupDemoWorkspace(models = defaultCleanupModels): Promise<{ users: number; employees: number; projects: number; tasks: number; approvals: number; refreshTokens: number }> {
  const [userIds, employeeIds, projectIds, taskIds] = await Promise.all([
    markedIds(models.users), markedIds(models.employees), markedIds(models.projects), markedIds(models.tasks),
  ]);
  const ids = { users: userIds, employees: employeeIds, projects: projectIds, tasks: taskIds };
  if (Object.values(ids).every((values) => values.length === 0)) {
    return { users: 0, employees: 0, projects: 0, tasks: 0, approvals: 0, refreshTokens: 0 };
  }

  // Refuse cleanup if ordinary application data has since been attached to demo records.
  const externalReferences = await Promise.all([
    employeeIds.length ? hasExternalReference(models.employees, { managerId: { $in: employeeIds } }) : false,
    userIds.length ? hasExternalReference(models.projects, { $or: [{ managerId: { $in: userIds } }, { createdBy: { $in: userIds } }] }) : false,
    employeeIds.length ? hasExternalReference(models.projects, { members: { $in: employeeIds } }) : false,
    projectIds.length ? hasExternalReference(models.tasks, { projectId: { $in: projectIds } }) : false,
    employeeIds.length ? hasExternalReference(models.tasks, { assignedTo: { $in: employeeIds } }) : false,
    userIds.length ? hasExternalReference(models.tasks, { createdBy: { $in: userIds } }) : false,
    taskIds.length ? hasExternalReference(models.approvals, { taskId: { $in: taskIds } }) : false,
    projectIds.length ? hasExternalReference(models.approvals, { projectId: { $in: projectIds } }) : false,
    userIds.length ? hasExternalReference(models.approvals, { requestedBy: { $in: userIds } }) : false,
    employeeIds.length ? hasExternalReference(models.approvals, { $or: [{ fromAssignedTo: { $in: employeeIds } }, { assignedTo: { $in: employeeIds } }] }) : false,
  ]);
  if (externalReferences.some(Boolean)) {
    throw new Error('Cleanup stopped: non-demo records now reference demo data. Remove or reassign those records first; nothing was deleted.');
  }

  const marker = new RegExp(`^${DEMO_SEED_NAMESPACE}:`);
  const [approvalResult, taskResult, projectResult, employeeResult] = await Promise.all([
    models.approvals.deleteMany({ demoSeedKey: marker }),
    models.tasks.deleteMany({ demoSeedKey: marker }),
    models.projects.deleteMany({ demoSeedKey: marker }),
    models.employees.deleteMany({ demoSeedKey: marker }),
  ]);
  const tokenResult = userIds.length ? await models.refreshTokens.deleteMany({ userId: { $in: userIds } }) : { deletedCount: 0 };
  const userResult = await models.users.deleteMany({ demoSeedKey: marker });
  return {
    users: userResult.deletedCount ?? 0,
    employees: employeeResult.deletedCount ?? 0,
    projects: projectResult.deletedCount ?? 0,
    tasks: taskResult.deletedCount ?? 0,
    approvals: approvalResult.deletedCount ?? 0,
    refreshTokens: tokenResult.deletedCount ?? 0,
  };
}
