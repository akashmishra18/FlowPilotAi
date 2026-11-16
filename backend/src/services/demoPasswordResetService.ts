import { Model } from 'mongoose';
import { Role } from '../config/constants';
import { UserDocument, UserModel } from '../models/User';
import { assertLocalMongoUri, DEMO_SEED_NAMESPACE } from './demoSeedService';
import { hashPassword } from '../utils/password';

export const DEMO_PASSWORD_RESET_ACCOUNTS = [
  { email: 'demo.admin@flowpilot.local', role: 'ADMIN', seedKey: 'user.admin' },
  { email: 'demo.manager@flowpilot.local', role: 'MANAGER', seedKey: 'user.manager' },
  { email: 'demo.employee.one@flowpilot.local', role: 'EMPLOYEE', seedKey: 'user.employee.a' },
  { email: 'demo.employee.two@flowpilot.local', role: 'EMPLOYEE', seedKey: 'user.employee.b' },
] as const satisfies ReadonlyArray<{ email: string; role: Role; seedKey: string }>;

export interface DemoPasswordResetOptions {
  nodeEnv?: string;
  mongoUri: string;
  optIn?: string;
  password?: string;
}

export function assertDemoPasswordResetAllowed(options: DemoPasswordResetOptions): void {
  if (options.nodeEnv === 'production') throw new Error('Demo account password reset is disabled in production.');
  if (options.optIn !== 'true') throw new Error('Set ALLOW_LOCAL_DEMO_PASSWORD_RESET=true to opt in.');
  if (!options.password || options.password.length < 12) {
    throw new Error('DEMO_SEED_PASSWORD is required and must be at least 12 characters.');
  }
  assertLocalMongoUri(options.mongoUri);
}

interface DemoUserRecord {
  email: string;
  role: Role;
  isActive: boolean;
  demoSeedKey: string;
}

interface PasswordResetUserModel {
  find(filter: Record<string, unknown>): {
    select(fields: string): { lean(): { exec(): Promise<DemoUserRecord[]> } };
  };
  updateMany(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ matchedCount: number }>;
}

/** Reset only the four known, seed-tagged accounts. No account fields besides passwordHash are written. */
export async function resetDemoAccountPasswords(
  password: string,
  model: PasswordResetUserModel = UserModel as unknown as Model<UserDocument> & PasswordResetUserModel,
  hash = hashPassword,
): Promise<number> {
  if (!password || password.length < 12) throw new Error('DEMO_SEED_PASSWORD must be at least 12 characters.');

  const expectedAccounts = DEMO_PASSWORD_RESET_ACCOUNTS.map((account) => ({
    ...account,
    demoSeedKey: `${DEMO_SEED_NAMESPACE}:${account.seedKey}`,
  }));
  const existing = await model.find({ email: { $in: expectedAccounts.map((account) => account.email) } })
    .select('email role isActive +demoSeedKey')
    .lean()
    .exec();

  for (const expected of expectedAccounts) {
    const account = existing.find((candidate) => candidate.email === expected.email);
    if (!account || account.demoSeedKey !== expected.demoSeedKey || account.role !== expected.role || !account.isActive) {
      throw new Error(`Expected active seeded demo account ${expected.email} was not found or has incompatible configuration. No passwords were changed.`);
    }
  }

  const passwordHash = await hash(password);
  const filter = {
    $or: expectedAccounts.map(({ email, demoSeedKey }) => ({ email, demoSeedKey })),
  };
  const result = await model.updateMany(filter, { $set: { passwordHash } });
  if (result.matchedCount !== expectedAccounts.length) {
    throw new Error('The set of demo accounts changed during reset; verify account state before retrying.');
  }
  return result.matchedCount;
}
