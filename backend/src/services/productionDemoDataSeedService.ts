import mongoose, { ClientSession, Types } from 'mongoose';
import { PROJECT_STATUS, TASK_STATUS } from '../config/constants';
import { EmployeeModel } from '../models/Employee';
import { ProjectModel } from '../models/Project';
import { TaskModel } from '../models/Task';
import { UserModel } from '../models/User';
import { recordAuditEvent } from './auditService';
import { PRODUCTION_DEMO_EMPLOYEE_PROFILES, PRODUCTION_DEMO_USERS } from './productionDemoProvisioningService';

export const PRODUCTION_DEMO_DATA_NAMESPACE = 'flowpilot-production-demo-data-v1';

type AccountKey = (typeof PRODUCTION_DEMO_USERS)[number]['key'];
type EmployeeKey = (typeof PRODUCTION_DEMO_EMPLOYEE_PROFILES)[number]['userKey'];

export const PRODUCTION_DEMO_PROJECTS = [
  {
    key: 'starlight',
    name: '[DEMO] Starlight',
    projectCode: 'DEMO-STARLIGHT',
    description: 'A sample co-op adventure project for demonstrating team workflows.',
    priority: 'HIGH',
    status: PROJECT_STATUS.ACTIVE,
    managerKey: 'manager.one',
    memberKeys: ['manager.one', 'employee.one', 'employee.two'],
  },
  {
    key: 'orbit',
    name: '[DEMO] Orbit',
    projectCode: 'DEMO-ORBIT',
    description: '',
    priority: 'MEDIUM',
    status: PROJECT_STATUS.PLANNING,
    managerKey: 'manager.two',
    memberKeys: ['manager.two', 'employee.three', 'employee.four', 'employee.five'],
  },
] as const satisfies ReadonlyArray<{
  key: string; name: string; projectCode: string; description: string; priority: 'HIGH' | 'MEDIUM';
  status: typeof PROJECT_STATUS[keyof typeof PROJECT_STATUS]; managerKey: AccountKey; memberKeys: readonly AccountKey[];
}>;

export const PRODUCTION_DEMO_TASKS = [
  {
    key: 'starlight-reconnect',
    title: '[DEMO] Review multiplayer reconnect flow',
    description: 'Check reconnection behavior after a short network interruption.',
    projectKey: 'starlight', assignedEmployeeKey: 'employee.two', createdByKey: 'manager.one',
    priority: 'HIGH', status: TASK_STATUS.IN_PROGRESS, dueDate: '2026-11-09T00:00:00.000Z', tags: ['demo', 'networking'],
  },
  {
    key: 'starlight-lighting',
    title: '[DEMO] Polish character lighting pass',
    description: '',
    projectKey: 'starlight', assignedEmployeeKey: 'employee.two', createdByKey: 'manager.one',
    priority: 'MEDIUM', status: TASK_STATUS.REVIEW, dueDate: '2026-11-18T00:00:00.000Z', tags: ['demo'],
  },
  {
    key: 'orbit-onboarding',
    title: '[DEMO] Build onboarding prototype',
    description: '',
    projectKey: 'orbit', assignedEmployeeKey: 'employee.three', createdByKey: 'manager.two',
    priority: 'LOW', status: TASK_STATUS.TODO, dueDate: '2026-11-23T00:00:00.000Z', tags: ['demo'],
  },
] as const;

type SeedRecord = Record<string, unknown> & { demoSeedKey?: string; _id?: unknown };
type RecordDecision = 'CREATE' | 'KEEP_EXISTING';

/** Never adopt a natural-key collision. A marked record is retained after validation. */
export function classifyProductionDemoRecord(
  markedRecord: SeedRecord | null,
  naturalKeyCollision: boolean,
  validateExisting: (record: SeedRecord) => void,
): RecordDecision {
  if (markedRecord) {
    validateExisting(markedRecord);
    return 'KEEP_EXISTING';
  }
  if (naturalKeyCollision) throw new Error('A non-seed record uses a reserved demo project code or task title. No data was changed.');
  return 'CREATE';
}

export function assertTaskAssigneeIsActiveProjectMember(
  project: { isActive: boolean; members: readonly unknown[] },
  assignee: { _id: unknown; isActive: boolean },
): void {
  if (!project.isActive) throw new Error('Cannot seed a task into an inactive project.');
  if (!assignee.isActive) throw new Error('Cannot assign a demo task to an inactive employee.');
  if (!project.members.some((memberId) => String(memberId) === String(assignee._id))) {
    throw new Error('Demo task assignee must be an active member of its project.');
  }
}

function seedKey(kind: 'project' | 'task', key: string): string {
  return `${PRODUCTION_DEMO_DATA_NAMESPACE}:${kind}:${key}`;
}

function sameId(left: unknown, right: unknown): boolean {
  return String(left ?? '') === String(right ?? '');
}

function sameIdSet(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((id) => right.some((other) => sameId(id, other)));
}

function attachSession<T extends { session(session: ClientSession): T }>(query: T, session?: ClientSession): T {
  return session ? query.session(session) : query;
}

interface ResolvedContext {
  users: Map<AccountKey, SeedRecord>;
  employees: Map<EmployeeKey, SeedRecord>;
}

async function resolveExistingAccounts(session?: ClientSession): Promise<ResolvedContext> {
  const userRows = await attachSession(
    UserModel.find({ email: { $in: PRODUCTION_DEMO_USERS.map((user) => user.email) } })
      .select('_id email role isActive').lean(), session,
  );
  const users = new Map<AccountKey, SeedRecord>();
  for (const spec of PRODUCTION_DEMO_USERS) {
    const user = userRows.find((row) => row.email === spec.email) as SeedRecord | undefined;
    if (!user || user.role !== spec.role || user.isActive !== true) {
      throw new Error(`Required pre-provisioned demo account is missing, inactive, or has the wrong role (${spec.key}).`);
    }
    users.set(spec.key, user);
  }

  const userIds = [...users.values()].map((user) => user._id);
  const employeeRows = await attachSession(
    EmployeeModel.find({ userId: { $in: userIds } })
      .select('_id userId employeeId isActive').lean(), session,
  );
  const employeeProfiles = PRODUCTION_DEMO_EMPLOYEE_PROFILES as ReadonlyArray<{
    userKey: EmployeeKey; employeeId: string;
  }>;
  const employees = new Map<EmployeeKey, SeedRecord>();
  for (const spec of employeeProfiles) {
    const user = users.get(spec.userKey);
    const employee = employeeRows.find((row) => sameId(row.userId, user?._id)) as SeedRecord | undefined;
    if (!employee || employee.employeeId !== spec.employeeId || employee.isActive !== true) {
      throw new Error(`Required pre-provisioned demo employee profile is missing, inactive, or mismatched (${spec.userKey}).`);
    }
    employees.set(spec.userKey, employee);
  }
  return { users, employees };
}

function expectedProject(spec: (typeof PRODUCTION_DEMO_PROJECTS)[number], context: ResolvedContext) {
  const manager = context.users.get(spec.managerKey);
  const managerEmployee = context.employees.get(spec.managerKey as EmployeeKey);
  if (!manager || manager.role !== 'MANAGER' || !managerEmployee) {
    throw new Error(`Project manager account/profile is not eligible (${spec.managerKey}).`);
  }
  const members = spec.memberKeys.map((key) => {
    const employee = context.employees.get(key as EmployeeKey);
    if (!employee || employee.isActive !== true) throw new Error(`Project member profile is unavailable (${key}).`);
    return employee._id as Types.ObjectId;
  });
  return {
    name: spec.name,
    projectCode: spec.projectCode,
    description: spec.description,
    status: spec.status,
    priority: spec.priority,
    clientName: '',
    startDate: new Date('2026-11-01T00:00:00.000Z'),
    deadline: null,
    managerId: manager._id as Types.ObjectId,
    members,
    isActive: true,
    createdBy: context.users.get('admin')!._id as Types.ObjectId,
  };
}

function validateProject(record: SeedRecord, expected: ReturnType<typeof expectedProject>): void {
  const matches = record.name === expected.name
    && record.projectCode === expected.projectCode
    && record.description === expected.description
    && record.status === expected.status
    && record.priority === expected.priority
    && record.clientName === expected.clientName
    && new Date(record.startDate as string | Date).getTime() === expected.startDate.getTime()
    && (record.deadline == null)
    && sameId(record.managerId, expected.managerId)
    && sameIdSet(record.members as unknown[], expected.members)
    && record.isActive === true
    && sameId(record.createdBy, expected.createdBy);
  if (!matches) throw new Error(`Existing marked demo project differs from the required definition (${expected.projectCode}). No data was changed.`);
}

function expectedTask(spec: (typeof PRODUCTION_DEMO_TASKS)[number], context: ResolvedContext, projects: Map<string, SeedRecord>) {
  const projectSpec = PRODUCTION_DEMO_PROJECTS.find((item) => item.key === spec.projectKey)!;
  const project = projects.get(spec.projectKey);
  const assignee = context.employees.get(spec.assignedEmployeeKey);
  const creator = context.users.get(spec.createdByKey);
  if (!project || !assignee || !creator) throw new Error(`Task relationship could not be resolved (${spec.key}).`);
  assertTaskAssigneeIsActiveProjectMember(project as { isActive: boolean; members: unknown[] }, assignee as { _id: unknown; isActive: boolean });
  if (!projectSpec.memberKeys.some((key) => sameId(context.employees.get(key as EmployeeKey)?._id, assignee._id))) {
    throw new Error(`Task assignee is not in the required project membership (${spec.key}).`);
  }
  return {
    title: spec.title,
    description: spec.description,
    projectId: project._id as Types.ObjectId,
    assignedTo: assignee._id as Types.ObjectId,
    createdBy: creator._id as Types.ObjectId,
    priority: spec.priority,
    status: spec.status,
    dueDate: new Date(spec.dueDate),
    completedAt: null,
    tags: [...spec.tags],
  };
}

function validateTask(record: SeedRecord, expected: ReturnType<typeof expectedTask>): void {
  const matches = record.title === expected.title
    && record.description === expected.description
    && sameId(record.projectId, expected.projectId)
    && sameId(record.assignedTo, expected.assignedTo)
    && sameId(record.createdBy, expected.createdBy)
    && record.priority === expected.priority
    && record.status === expected.status
    && new Date(record.dueDate as string | Date).getTime() === expected.dueDate.getTime()
    && record.completedAt == null
    && Array.isArray(record.tags) && sameIdSet(record.tags, expected.tags);
  if (!matches) throw new Error(`Existing marked demo task differs from the required definition (${expected.title}). No data was changed.`);
}

async function findByMarker(model: typeof ProjectModel | typeof TaskModel, marker: string, session?: ClientSession): Promise<SeedRecord | null> {
  const query = model === ProjectModel
    ? ProjectModel.findOne({ demoSeedKey: marker }).select('+demoSeedKey').lean()
    : TaskModel.findOne({ demoSeedKey: marker }).select('+demoSeedKey').lean();
  return await attachSession(query, session) as SeedRecord | null;
}

async function findNaturalCollision(
  model: typeof ProjectModel | typeof TaskModel,
  naturalFilter: Record<string, unknown>,
  session?: ClientSession,
): Promise<SeedRecord | null> {
  const query = model === ProjectModel
    ? ProjectModel.findOne(naturalFilter).select('+demoSeedKey').lean()
    : TaskModel.findOne(naturalFilter).select('+demoSeedKey').lean();
  return await attachSession(query, session) as SeedRecord | null;
}

async function assertPreflight(context: ResolvedContext, session?: ClientSession): Promise<{ projects: Map<string, SeedRecord>; projectsToCreate: number; tasksToCreate: number }> {
  const projectRecords = new Map<string, SeedRecord>();
  let projectsToCreate = 0;
  for (const spec of PRODUCTION_DEMO_PROJECTS) {
    const marker = seedKey('project', spec.key);
    const expected = expectedProject(spec, context);
    const marked = await findByMarker(ProjectModel, marker, session);
    const collision = marked ? null : await findNaturalCollision(ProjectModel, { projectCode: spec.projectCode }, session);
    const decision = classifyProductionDemoRecord(marked, Boolean(collision), (record) => validateProject(record, expected));
    if (decision === 'CREATE') projectsToCreate += 1;
    if (marked) projectRecords.set(spec.key, marked);
  }

  // For tasks, membership is checked against the intended project member set before writes.
  // A newly-created project is represented by the same expected fields and a placeholder id;
  // the actual membership IDs come from the already-resolved active employee records.
  const projectContext = new Map<string, SeedRecord>();
  for (const spec of PRODUCTION_DEMO_PROJECTS) {
    const expected = expectedProject(spec, context);
    const found = projectRecords.get(spec.key);
    projectContext.set(spec.key, found ?? ({ ...expected, _id: `pending:${spec.key}` } as unknown as SeedRecord));
  }

  let tasksToCreate = 0;
  for (const spec of PRODUCTION_DEMO_TASKS) {
    const marker = seedKey('task', spec.key);
    const expected = expectedTask(spec, context, projectContext);
    const marked = await findByMarker(TaskModel, marker, session);
    const collision = marked ? null : await findNaturalCollision(TaskModel, { title: spec.title }, session);
    const decision = classifyProductionDemoRecord(marked, Boolean(collision), (record) => validateTask(record, expected));
    if (decision === 'CREATE') tasksToCreate += 1;
  }
  return { projects: projectRecords, projectsToCreate, tasksToCreate };
}

export interface ProductionDemoDataSeedResult {
  dryRun: boolean;
  projectsCreated: number;
  tasksCreated: number;
  projectsAlreadyPresent: number;
  tasksAlreadyPresent: number;
}

export async function seedProductionDemoData(mode: 'dry-run' | 'execute'): Promise<ProductionDemoDataSeedResult> {
  if (mode === 'dry-run') {
    const context = await resolveExistingAccounts();
    const plan = await assertPreflight(context);
    return {
      dryRun: true,
      projectsCreated: plan.projectsToCreate,
      tasksCreated: plan.tasksToCreate,
      projectsAlreadyPresent: PRODUCTION_DEMO_PROJECTS.length - plan.projectsToCreate,
      tasksAlreadyPresent: PRODUCTION_DEMO_TASKS.length - plan.tasksToCreate,
    };
  }

  const session = await mongoose.startSession();
  const result: ProductionDemoDataSeedResult = {
    dryRun: false, projectsCreated: 0, tasksCreated: 0,
    projectsAlreadyPresent: 0, tasksAlreadyPresent: 0,
  };
  try {
    await session.withTransaction(async () => {
      // The driver may retry this callback after a transient transaction error.
      result.projectsCreated = 0;
      result.tasksCreated = 0;
      result.projectsAlreadyPresent = 0;
      result.tasksAlreadyPresent = 0;
      const context = await resolveExistingAccounts(session);
      const plan = await assertPreflight(context, session);
      const projects = new Map<string, SeedRecord>();

      for (const spec of PRODUCTION_DEMO_PROJECTS) {
        const marker = seedKey('project', spec.key);
        const values = expectedProject(spec, context);
        const project = await ProjectModel.findOneAndUpdate(
          { demoSeedKey: marker }, { $setOnInsert: { ...values, demoSeedKey: marker } },
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true, session },
        ).select('+demoSeedKey').lean() as SeedRecord | null;
        if (!project) throw new Error(`Project upsert returned no document (${spec.key}).`);
        validateProject(project, values);
        projects.set(spec.key, project);
        if (plan.projects.has(spec.key) === false) {
          result.projectsCreated += 1;
          await recordAuditEvent({ actorUserId: String(values.createdBy), actorRole: 'ADMIN', action: 'PRODUCTION_DEMO_PROJECT_SEEDED', targetType: 'Project', targetId: String(project._id), outcome: 'SUCCESS', after: { projectCode: spec.projectCode, status: spec.status, priority: spec.priority } }, session);
        } else result.projectsAlreadyPresent += 1;
      }

      for (const spec of PRODUCTION_DEMO_TASKS) {
        const marker = seedKey('task', spec.key);
        const values = expectedTask(spec, context, projects);
        // Recheck active membership using the database record returned by the project upsert.
        const assignee = context.employees.get(spec.assignedEmployeeKey)!;
        assertTaskAssigneeIsActiveProjectMember(projects.get(spec.projectKey)! as { isActive: boolean; members: unknown[] }, assignee as { _id: unknown; isActive: boolean });
        const existing = await findByMarker(TaskModel, marker, session);
        const collision = existing ? null : await findNaturalCollision(TaskModel, { title: spec.title }, session);
        const decision = classifyProductionDemoRecord(existing, Boolean(collision), (record) => validateTask(record, values));
        if (decision === 'KEEP_EXISTING') {
          result.tasksAlreadyPresent += 1;
          continue;
        }
        const task = await TaskModel.findOneAndUpdate(
          { demoSeedKey: marker }, { $setOnInsert: { ...values, demoSeedKey: marker } },
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true, session },
        ).select('+demoSeedKey').lean() as SeedRecord | null;
        if (!task) throw new Error(`Task upsert returned no document (${spec.key}).`);
        validateTask(task, values);
        result.tasksCreated += 1;
        await recordAuditEvent({ actorUserId: String(values.createdBy), actorRole: 'MANAGER', action: 'PRODUCTION_DEMO_TASK_SEEDED', targetType: 'Task', targetId: String(task._id), outcome: 'SUCCESS', after: { status: spec.status, priority: spec.priority, projectId: String(values.projectId), assignedTo: String(values.assignedTo) } }, session);
      }
    });
  } finally {
    await session.endSession();
  }
  return result;
}
