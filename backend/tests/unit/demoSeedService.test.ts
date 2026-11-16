import {
  assertLocalDemoCleanupAllowed,
  assertLocalDemoSeedAllowed,
  cleanupDemoWorkspace,
  DEMO_SEED_NAMESPACE,
  ensureDemoRecord,
} from '../../src/services/demoSeedService';

const localOptions = {
  nodeEnv: 'development',
  mongoUri: 'mongodb://localhost:27017/flowpilot_local',
  optIn: 'true',
  password: 'a long demo-only password',
};

function modelStub(existing: unknown = null, collision: unknown = null) {
  const query = { select: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(existing) };
  return {
    findOne: jest.fn().mockReturnValue(query),
    exists: jest.fn().mockResolvedValue(collision),
    create: jest.fn().mockResolvedValue({ _id: 'created' }),
    find: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
  };
}

function cleanupModel(ids: string[]) {
  const query = {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(ids.map((_id) => ({ _id }))),
  };
  return {
    find: jest.fn().mockReturnValue(query),
    exists: jest.fn().mockResolvedValue(null),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: ids.length }),
  };
}

describe('local demo seed safety', () => {
  it('requires explicit opt-in and an explicit password, rejects production and non-local databases', () => {
    expect(() => assertLocalDemoSeedAllowed(localOptions)).not.toThrow();
    expect(() => assertLocalDemoSeedAllowed({ ...localOptions, nodeEnv: 'production' })).toThrow(/disabled in production/);
    expect(() => assertLocalDemoSeedAllowed({ ...localOptions, optIn: undefined })).toThrow(/ALLOW_LOCAL_DEMO_SEED/);
    expect(() => assertLocalDemoSeedAllowed({ ...localOptions, password: '' })).toThrow(/DEMO_SEED_PASSWORD/);
    expect(() => assertLocalDemoSeedAllowed({ ...localOptions, mongoUri: 'mongodb+srv://user:secret@cluster.example/db' })).toThrow(/restricted to MongoDB on this computer/);
  });

  it('requires a separate exact confirmation for cleanup and rejects production', () => {
    expect(() => assertLocalDemoCleanupAllowed({ ...localOptions, confirmation: 'DELETE_FLOWPILOT_LOCAL_DEMO' })).not.toThrow();
    expect(() => assertLocalDemoCleanupAllowed({ ...localOptions, confirmation: 'yes' })).toThrow(/CONFIRM_LOCAL_DEMO_CLEANUP/);
    expect(() => assertLocalDemoCleanupAllowed({ ...localOptions, nodeEnv: 'production', confirmation: 'DELETE_FLOWPILOT_LOCAL_DEMO' })).toThrow(/disabled in production/);
  });

  it('reuses a previously tagged record without overwriting it', async () => {
    const existing = { _id: 'existing', name: 'Changed by admin' };
    const model = modelStub(existing);
    const result = await ensureDemoRecord(model as unknown as Parameters<typeof ensureDemoRecord>[0], `${DEMO_SEED_NAMESPACE}:user.admin`, { email: 'demo.admin@flowpilot.local' }, { name: 'Original' });
    expect(result).toBe(existing);
    expect(model.create).not.toHaveBeenCalled();
    expect(model.exists).not.toHaveBeenCalled();
  });

  it('refuses to adopt or overwrite a non-demo record using a reserved identifier', async () => {
    const model = modelStub(null, { _id: 'unmarked' });
    await expect(ensureDemoRecord(model as unknown as Parameters<typeof ensureDemoRecord>[0], `${DEMO_SEED_NAMESPACE}:user.admin`, { email: 'demo.admin@flowpilot.local' }, { name: 'Original' })).rejects.toThrow(/No data was changed/);
    expect(model.create).not.toHaveBeenCalled();
  });

  it('cleanup refuses to delete demo data when ordinary records reference it', async () => {
    const users = cleanupModel(['demo-user']);
    const employees = cleanupModel(['demo-employee']);
    const projects = cleanupModel(['demo-project']);
    const tasks = cleanupModel(['demo-task']);
    const approvals = cleanupModel(['demo-approval']);
    const refreshTokens = cleanupModel([]);
    tasks.exists.mockResolvedValueOnce({ _id: 'ordinary-task-reference' });

    await expect(cleanupDemoWorkspace({ users, employees, projects, tasks, approvals, refreshTokens } as unknown as Parameters<typeof cleanupDemoWorkspace>[0])).rejects.toThrow(/nothing was deleted/);
    expect(users.deleteMany).not.toHaveBeenCalled();
    expect(employees.deleteMany).not.toHaveBeenCalled();
    expect(projects.deleteMany).not.toHaveBeenCalled();
    expect(tasks.deleteMany).not.toHaveBeenCalled();
    expect(approvals.deleteMany).not.toHaveBeenCalled();
  });

  it('cleanup deletes only namespace-tagged records and preserves audit history', async () => {
    const users = cleanupModel(['demo-user']);
    const employees = cleanupModel(['demo-employee']);
    const projects = cleanupModel(['demo-project']);
    const tasks = cleanupModel(['demo-task']);
    const approvals = cleanupModel(['demo-approval']);
    const refreshTokens = cleanupModel([]);

    const counts = await cleanupDemoWorkspace({ users, employees, projects, tasks, approvals, refreshTokens } as unknown as Parameters<typeof cleanupDemoWorkspace>[0]);
    expect(counts).toEqual({ users: 1, employees: 1, projects: 1, tasks: 1, approvals: 1, refreshTokens: 0 });
    for (const model of [users, employees, projects, tasks, approvals]) {
      expect(model.deleteMany).toHaveBeenCalledWith({ demoSeedKey: expect.any(RegExp) });
    }
    expect(refreshTokens.deleteMany).toHaveBeenCalledWith({ userId: { $in: ['demo-user'] } });
  });
});
