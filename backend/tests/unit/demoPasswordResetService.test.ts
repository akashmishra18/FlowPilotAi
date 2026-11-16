import {
  assertDemoPasswordResetAllowed,
  DEMO_PASSWORD_RESET_ACCOUNTS,
  resetDemoAccountPasswords,
} from '../../src/services/demoPasswordResetService';
import { DEMO_SEED_NAMESPACE } from '../../src/services/demoSeedService';

const options = {
  nodeEnv: 'development',
  mongoUri: 'mongodb://127.0.0.1:27017/flowpilot_local',
  optIn: 'true',
  password: 'new-local-demo-password',
};

function modelStub(overrides: Partial<{ records: Array<{ email: string; role: string; isActive: boolean; demoSeedKey: string }>; matchedCount: number }> = {}) {
  const records = overrides.records ?? DEMO_PASSWORD_RESET_ACCOUNTS.map((account) => ({
    email: account.email,
    role: account.role,
    isActive: true,
    demoSeedKey: `${DEMO_SEED_NAMESPACE}:${account.seedKey}`,
  }));
  const query = { select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(records) };
  return {
    find: jest.fn().mockReturnValue(query),
    updateMany: jest.fn().mockResolvedValue({ matchedCount: overrides.matchedCount ?? 4 }),
  };
}

describe('demo account password reset', () => {
  it('requires explicit opt-in, a strong password, non-production and a local MongoDB URI', () => {
    expect(() => assertDemoPasswordResetAllowed(options)).not.toThrow();
    expect(() => assertDemoPasswordResetAllowed({ ...options, nodeEnv: 'production' })).toThrow(/disabled in production/);
    expect(() => assertDemoPasswordResetAllowed({ ...options, optIn: undefined })).toThrow(/ALLOW_LOCAL_DEMO_PASSWORD_RESET/);
    expect(() => assertDemoPasswordResetAllowed({ ...options, password: 'short' })).toThrow(/12 characters/);
    expect(() => assertDemoPasswordResetAllowed({ ...options, mongoUri: 'mongodb+srv://cluster.example/db' })).toThrow(/restricted to MongoDB on this computer/);
  });

  it('updates only the four exact seed-tagged accounts and writes only passwordHash', async () => {
    const model = modelStub();
    const hash = jest.fn().mockResolvedValue('bcrypt-hash');

    await expect(resetDemoAccountPasswords(options.password, model as never, hash)).resolves.toBe(4);

    expect(hash).toHaveBeenCalledWith(options.password);
    expect(model.updateMany).toHaveBeenCalledWith({
      $or: DEMO_PASSWORD_RESET_ACCOUNTS.map((account) => ({
        email: account.email,
        demoSeedKey: `${DEMO_SEED_NAMESPACE}:${account.seedKey}`,
      })),
    }, { $set: { passwordHash: 'bcrypt-hash' } });
  });

  it('changes no passwords when any expected demo account is missing or incompatible', async () => {
    const model = modelStub({ records: [] });
    const hash = jest.fn();

    await expect(resetDemoAccountPasswords(options.password, model as never, hash)).rejects.toThrow(/No passwords were changed/);
    expect(hash).not.toHaveBeenCalled();
    expect(model.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to reset an incomplete match if account state changes during the operation', async () => {
    const model = modelStub({ matchedCount: 3 });
    await expect(resetDemoAccountPasswords(options.password, model as never, jest.fn().mockResolvedValue('hash'))).rejects.toThrow(/changed during reset/);
  });
});
