import {
  assertProductionDemoProvisioningAllowed,
  classifyExistingProductionDemo,
  EXISTING_DEMO_EMAILS,
  generateDemoPassword,
  PRODUCTION_DEMO_EMPLOYEE_PROFILES,
  PRODUCTION_DEMO_USERS,
} from '../../src/services/productionDemoProvisioningService';

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
});
