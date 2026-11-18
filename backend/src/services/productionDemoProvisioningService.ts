import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import { EmployeeDocument, EmployeeModel } from '../models/Employee';
import { UserModel } from '../models/User';
import { recordAuditEvent } from './auditService';
import { comparePassword, hashPassword } from '../utils/password';
import { loginUser, logoutUser } from './authService';

export const PRODUCTION_DEMO_NAMESPACE = 'flowpilot-production-demo-v1';

export const PRODUCTION_DEMO_USERS = [
  { key: 'admin', name: '[DEMO] Alex Rivera', email: 'submission.demo.admin@flowpilot.local', role: 'ADMIN' },
  { key: 'manager.one', name: '[DEMO] Morgan Lee', email: 'submission.demo.manager.one@flowpilot.local', role: 'MANAGER' },
  { key: 'manager.two', name: '[DEMO] Priya Nair', email: 'submission.demo.manager.two@flowpilot.local', role: 'MANAGER' },
  { key: 'employee.one', name: '[DEMO] Jamie Chen', email: 'submission.demo.employee.one@flowpilot.local', role: 'EMPLOYEE' },
  { key: 'employee.two', name: '[DEMO] Taylor Morgan', email: 'submission.demo.employee.two@flowpilot.local', role: 'EMPLOYEE' },
  { key: 'employee.three', name: '[DEMO] Samira Patel', email: 'submission.demo.employee.three@flowpilot.local', role: 'EMPLOYEE' },
  { key: 'employee.four', name: '[DEMO] Daniel Kim', email: 'submission.demo.employee.four@flowpilot.local', role: 'EMPLOYEE' },
  { key: 'employee.five', name: '[DEMO] Noor Hassan', email: 'submission.demo.employee.five@flowpilot.local', role: 'EMPLOYEE' },
] as const;

// Detect the local seed's existing demo identity convention before using a separate production marker set.
export const EXISTING_DEMO_EMAILS = [
  'demo.admin@flowpilot.local',
  'demo.manager@flowpilot.local',
  'demo.manager.one@flowpilot.local',
  'demo.manager.two@flowpilot.local',
  'demo.employee.one@flowpilot.local',
  'demo.employee.two@flowpilot.local',
] as const;

export const PRODUCTION_DEMO_EMPLOYEE_PROFILES = [
  { userKey: 'manager.one', employeeId: 'DEMO-PROD-MGR-001', department: 'Engineering', designation: 'Engineering Manager', managerKey: null, skills: ['delivery planning', 'team leadership'] },
  { userKey: 'manager.two', employeeId: 'DEMO-PROD-MGR-002', department: 'Operations', designation: 'Operations Manager', managerKey: null, skills: ['operations', 'project planning'] },
  { userKey: 'employee.one', employeeId: 'DEMO-PROD-EMP-001', department: 'Engineering', designation: 'Gameplay Developer', managerKey: 'manager.one', skills: ['Unity', 'C#'] },
  { userKey: 'employee.two', employeeId: 'DEMO-PROD-EMP-002', department: 'Engineering', designation: 'QA Engineer', managerKey: 'manager.one', skills: ['testing', 'automation'] },
  { userKey: 'employee.three', employeeId: 'DEMO-PROD-EMP-003', department: 'Engineering', designation: 'Technical Artist', managerKey: 'manager.one', skills: ['Blender', 'shaders'] },
  { userKey: 'employee.four', employeeId: 'DEMO-PROD-EMP-004', department: 'Operations', designation: 'Project Coordinator', managerKey: 'manager.two', skills: ['coordination', 'reporting'] },
  { userKey: 'employee.five', employeeId: 'DEMO-PROD-EMP-005', department: 'Operations', designation: 'Support Specialist', managerKey: 'manager.two', skills: ['client support', 'triage'] },
] as const;
const employeeProfiles = PRODUCTION_DEMO_EMPLOYEE_PROFILES;

export interface ProductionDemoSafetyOptions {
  nodeEnv?: string;
  optIn?: string;
  mongoUri: string;
  confirmationFlag: boolean;
  mode: 'dry-run' | 'execute';
}

export function assertProductionDemoProvisioningAllowed(options: ProductionDemoSafetyOptions): void {
  if (options.nodeEnv !== 'production') throw new Error('This command is restricted to NODE_ENV=production.');
  if (options.optIn !== 'true') throw new Error('Set ALLOW_PRODUCTION_DEMO_PROVISIONING=true to opt in.');
  if (!options.confirmationFlag) throw new Error('Pass --confirm-production-demo-provisioning to continue.');
  let hostname: string;
  try {
    const parsed = new URL(options.mongoUri);
    if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) throw new Error('scheme');
    hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    throw new Error('MONGODB_URI must point to a valid production MongoDB host.');
  }
  if (!hostname || ['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error('Production demo provisioning refuses a local MongoDB target.');
  }
  if (!['dry-run', 'execute'].includes(options.mode)) throw new Error('Choose exactly one of --dry-run or --execute.');
}

export function classifyExistingProductionDemo(markerCount: number, expectedCount: number): 'empty' | 'complete' {
  if (markerCount === 0) return 'empty';
  if (markerCount === expectedCount) return 'complete';
  throw new Error('A partial production demo seed already exists. No data was changed; investigate it manually.');
}

export function generateDemoPassword(): string {
  return randomBytes(32).toString('base64url');
}

export interface ProvisioningResult {
  created: boolean;
  dryRun?: boolean;
  users: number;
  employees: number;
  credentials?: Array<{ name: string; email: string; role: string; password: string }>;
}

async function inspectExisting(session?: mongoose.ClientSession) {
  const userKeys = PRODUCTION_DEMO_USERS.map(({ key }) => `${PRODUCTION_DEMO_NAMESPACE}:user:${key}`);
  const profileKeys = employeeProfiles.map(({ userKey }) => `${PRODUCTION_DEMO_NAMESPACE}:employee:${userKey}`);
  const userQuery = UserModel.find({ demoSeedKey: { $in: userKeys } }).select('+demoSeedKey');
  const employeeQuery = EmployeeModel.find({ demoSeedKey: { $in: profileKeys } }).select('+demoSeedKey');
  if (session) {
    userQuery.session(session);
    employeeQuery.session(session);
  }
  const [markedUsers, markedEmployees] = await Promise.all([
    userQuery.lean(),
    employeeQuery.lean(),
  ]);
  const state = classifyExistingProductionDemo(markedUsers.length + markedEmployees.length, userKeys.length + profileKeys.length);
  if (state === 'complete') {
    const usersByKey = new Map(markedUsers.map((user) => [user.demoSeedKey, user]));
    for (const spec of PRODUCTION_DEMO_USERS) {
      const user = usersByKey.get(`${PRODUCTION_DEMO_NAMESPACE}:user:${spec.key}`);
      if (!user || user.email !== spec.email || user.role !== spec.role || user.isActive !== true) {
        throw new Error('Existing marked demo accounts do not match the expected active roles. No data was changed.');
      }
    }
    const employeesByKey = new Map(markedEmployees.map((employee) => [employee.demoSeedKey, employee]));
    const profilesByKey = new Map(employeeProfiles.map((profile) => [profile.userKey, employeesByKey.get(`${PRODUCTION_DEMO_NAMESPACE}:employee:${profile.userKey}`)]));
    for (const profile of employeeProfiles) {
      const employee = employeesByKey.get(`${PRODUCTION_DEMO_NAMESPACE}:employee:${profile.userKey}`);
      const user = usersByKey.get(`${PRODUCTION_DEMO_NAMESPACE}:user:${profile.userKey}`);
      const expectedManager = profile.managerKey ? profilesByKey.get(profile.managerKey)?._id : null;
      if (!employee || !user || String(employee.userId) !== String(user._id) || employee.employeeId !== profile.employeeId || employee.isActive !== true || String(employee.managerId ?? '') !== String(expectedManager ?? '')) {
        throw new Error('Existing marked demo employee profiles do not match the expected active relationships. No data was changed.');
      }
    }
    return { state, markedUsers, markedEmployees };
  }

  const emailCollisionQuery = UserModel.exists({ email: { $in: PRODUCTION_DEMO_USERS.map(({ email }) => email) } });
  const employeeIdCollisionQuery = EmployeeModel.exists({ employeeId: { $in: employeeProfiles.map(({ employeeId }) => employeeId) } });
  if (session) {
    emailCollisionQuery.session(session);
    employeeIdCollisionQuery.session(session);
  }
  const [emailCollision, employeeIdCollision] = await Promise.all([emailCollisionQuery, employeeIdCollisionQuery]);
  const existingDemoQuery = UserModel.exists({ email: { $in: EXISTING_DEMO_EMAILS } });
  if (session) existingDemoQuery.session(session);
  const existingDemoIdentity = await existingDemoQuery;
  if (emailCollision || employeeIdCollision || existingDemoIdentity) {
    throw new Error('A non-demo account or employee profile uses a reserved production demo identifier. No data was changed.');
  }
  return { state, markedUsers, markedEmployees };
}

export async function provisionProductionDemoUsers(mode: 'dry-run' | 'execute'): Promise<ProvisioningResult> {
  const existing = await inspectExisting();
  if (existing.state === 'complete') return { created: false, users: PRODUCTION_DEMO_USERS.length, employees: employeeProfiles.length };
  if (mode === 'dry-run') return { created: false, dryRun: true, users: PRODUCTION_DEMO_USERS.length, employees: employeeProfiles.length };

  const session = await mongoose.startSession();
  const generated = PRODUCTION_DEMO_USERS.map((user) => ({ ...user, password: generateDemoPassword() }));
  try {
    await session.withTransaction(async () => {
      // Recheck collisions inside the transaction to protect against concurrent execution.
      await inspectExisting(session);
      const hashed = await Promise.all(generated.map(async ({ password }) => hashPassword(password)));
      const userDocs = PRODUCTION_DEMO_USERS.map((user, index) => ({
        name: user.name,
        email: user.email,
        passwordHash: hashed[index],
        role: user.role,
        isActive: true,
        demoSeedKey: `${PRODUCTION_DEMO_NAMESPACE}:user:${user.key}`,
      }));
      const createdUsers = await UserModel.create(userDocs, { session });
      const usersByKey = new Map(PRODUCTION_DEMO_USERS.map((user, index) => [user.key, createdUsers[index]]));
      const profilesByKey = new Map<string, EmployeeDocument>();
      for (const profile of employeeProfiles) {
        const managerId = profile.managerKey ? profilesByKey.get(profile.managerKey)?._id : null;
        if (profile.managerKey && !managerId) throw new Error('Demo manager profile relationship could not be resolved.');
        const created = await EmployeeModel.create([{
          userId: usersByKey.get(profile.userKey)!._id,
          employeeId: profile.employeeId,
          department: profile.department,
          designation: profile.designation,
          joinedAt: new Date(),
          managerId,
          skills: [...profile.skills],
          isActive: true,
          demoSeedKey: `${PRODUCTION_DEMO_NAMESPACE}:employee:${profile.userKey}`,
        }], { session });
        profilesByKey.set(profile.userKey, created[0]);
      }
      for (let index = 0; index < createdUsers.length; index += 1) {
        await recordAuditEvent({
          actorUserId: String(createdUsers[0]._id), actorRole: 'ADMIN',
          action: 'PRODUCTION_DEMO_USER_PROVISIONED', targetType: 'User', targetId: String(createdUsers[index]._id), outcome: 'SUCCESS',
          after: { role: createdUsers[index].role, isActive: true, demo: true },
        }, session);
      }
      for (const profile of employeeProfiles) {
        const employee = profilesByKey.get(profile.userKey)!;
        await recordAuditEvent({
          actorUserId: String(createdUsers[0]._id), actorRole: 'ADMIN',
          action: 'PRODUCTION_DEMO_EMPLOYEE_CREATED', targetType: 'Employee', targetId: String(employee._id), outcome: 'SUCCESS',
          after: { employeeId: employee.employeeId, userId: String(employee.userId), managerId: employee.managerId ? String(employee.managerId) : null, demo: true },
        }, session);
      }
    });
  } finally {
    await session.endSession();
  }

  // Exercise the real login service, then immediately revoke each verification session.
  for (const account of generated) {
    const { user, tokens } = await loginUser({ email: account.email, password: account.password });
    try {
      if (user.role !== account.role || user.isActive !== true) throw new Error('A created demo account failed role or active-status verification.');
      const stored = await UserModel.findById(user._id).select('+passwordHash');
      if (!stored || !(await comparePassword(account.password, stored.passwordHash))) throw new Error('A created demo account failed password verification.');
    } finally {
      await logoutUser(tokens.refreshToken);
    }
  }

  return {
    created: true,
    users: PRODUCTION_DEMO_USERS.length,
    employees: employeeProfiles.length,
    credentials: generated.map(({ name, email, role, password }) => ({ name, email, role, password })),
  };
}
