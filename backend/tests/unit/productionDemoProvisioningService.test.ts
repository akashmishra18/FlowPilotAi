import mongoose from 'mongoose';
import { EmployeeModel } from '../../src/models/Employee';
import { UserModel } from '../../src/models/User';
import {
  assertProductionDemoProvisioningAllowed,
  classifyExistingProductionDemo,
  createDocumentsInTransaction,
  EXISTING_DEMO_EMAILS,
  generateDemoPassword,
  PRODUCTION_DEMO_EMPLOYEE_PROFILES,
  PRODUCTION_DEMO_USERS,
  provisionProductionDemoUsers,
  sanitizeProvisioningError,
} from '../../src/services/productionDemoProvisioningService';

jest.mock('../../src/models/User', () => ({ UserModel: { find: jest.fn(), exists: jest.fn() } }));
jest.mock('../../src/models/Employee', () => ({ EmployeeModel: { find: jest.fn(), exists: jest.fn() } }));

describe('production demo provisioning safeguards', () => {
  const safeOptions = {
    nodeEnv: 'production',
    optIn: 'true',
    mongoUri: 'mongodb+srv://example.invalid/flowpilot',
    confirmationFlag: true,
    mode: 'dry-run' as const,
  };

  it('requires production, explicit opt-in, confirmation, a non-local MongoDB target, and one mode', () => {
    expect(() => assertProductionDemoProvisioningAllowed(safeOptions)).not.toThrow();
    expect(() => assertProductionDemoProvisioningAllowed({ ...safeOptions, nodeEnv: 'development' })).toThrow(/NODE_ENV/);
    expect(() => assertProductionDemoProvisioningAllowed({ ...safeOptions, optIn: undefined })).toThrow(/ALLOW_PRODUCTION/);
    expect(() => assertProductionDemoProvisioningAllowed({ ...safeOptions, confirmationFlag: false })).toThrow(/--confirm/);
    expect(() => assertProductionDemoProvisioningAllowed({ ...safeOptions, mongoUri: 'mongodb://localhost:27017/app' })).toThrow(/local MongoDB/);
  });

  it('defines exactly one admin, two managers, five employees and seven linked employee profiles', () => {
    expect(PRODUCTION_DEMO_USERS).toHaveLength(8);
    expect(PRODUCTION_DEMO_USERS.filter(({ role }) => role === 'ADMIN')).toHaveLength(1);
    expect(PRODUCTION_DEMO_USERS.filter(({ role }) => role === 'MANAGER')).toHaveLength(2);
    expect(PRODUCTION_DEMO_USERS.filter(({ role }) => role === 'EMPLOYEE')).toHaveLength(5);
    expect(new Set(PRODUCTION_DEMO_USERS.map(({ email }) => email)).size).toBe(8);
    expect(EXISTING_DEMO_EMAILS).toContain('demo.admin@flowpilot.local');
    expect(PRODUCTION_DEMO_EMPLOYEE_PROFILES).toHaveLength(7);
    expect(PRODUCTION_DEMO_EMPLOYEE_PROFILES.filter(({ managerKey }) => managerKey === 'manager.one')).toHaveLength(3);
    expect(PRODUCTION_DEMO_EMPLOYEE_PROFILES.filter(({ managerKey }) => managerKey === 'manager.two')).toHaveLength(2);
  });

  it('accepts only an empty or complete idempotency marker set', () => {
    expect(classifyExistingProductionDemo(0, 15)).toBe('empty');
    expect(classifyExistingProductionDemo(15, 15)).toBe('complete');
    expect(() => classifyExistingProductionDemo(4, 15)).toThrow(/partial/);
  });

  it('generates distinct, high-entropy passwords at runtime', () => {
    const passwords = Array.from({ length: 8 }, generateDemoPassword);
    expect(passwords.every((password) => password.length >= 40)).toBe(true);
    expect(new Set(passwords).size).toBe(8);
  });

  it('sanitizes database URIs, credentials, secrets and personal email from failure diagnostics while retaining code/message', () => {
    const error = Object.assign(
      new Error('connect failed mongodb+srv://db-user:db-pass@cluster.example/db?secret=uri-secret password=demo-pass contact person@example.com'),
      { code: 'ETIMEDOUT' },
    );
    const diagnostic = sanitizeProvisioningError(error);
    expect(diagnostic).toEqual(expect.objectContaining({ errorClass: 'Error', errorCode: 'ETIMEDOUT' }));
    expect(diagnostic.message).toContain('connect failed');
    for (const secret of ['db-user', 'db-pass', 'uri-secret', 'demo-pass', 'person@example.com', 'cluster.example']) {
      expect(diagnostic.message).not.toContain(secret);
    }
  });

  it('keeps dry-run read-only and does not start a MongoDB transaction', async () => {
    (UserModel.find as jest.Mock).mockReturnValue({ select: () => ({ lean: async () => [] }) });
    (EmployeeModel.find as jest.Mock).mockReturnValue({ select: () => ({ lean: async () => [] }) });
    (UserModel.exists as jest.Mock).mockResolvedValue(null);
    (EmployeeModel.exists as jest.Mock).mockResolvedValue(null);
    const sessionSpy = jest.spyOn(mongoose, 'startSession').mockImplementation(() => {
      throw new Error('Dry run must not start a transaction');
    });

    await expect(provisionProductionDemoUsers('dry-run')).resolves.toEqual({
      created: false,
      dryRun: true,
      users: 8,
      employees: 7,
    });
    expect(sessionSpy).not.toHaveBeenCalled();
  });

  it('creates multiple documents in a transaction with Mongoose ordered session options', async () => {
    const session = { withTransaction: async (work: () => Promise<unknown>) => work() } as mongoose.ClientSession;
    const documents = [{ role: 'ADMIN' }, { role: 'MANAGER' }];
    const model = { create: jest.fn().mockResolvedValue(documents) };

    await session.withTransaction(() => createDocumentsInTransaction(model, documents, session));

    expect(model.create).toHaveBeenCalledWith(documents, { session, ordered: true });
  });
});
