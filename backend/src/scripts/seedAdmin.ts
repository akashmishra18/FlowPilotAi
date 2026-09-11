import { connectDatabase, disconnectDatabase } from '../config/database';
import { isProduction } from '../config/env';
import { UserModel } from '../models/User';
import { hashPassword } from '../utils/password';
import { logger } from '../utils/logger';

/**
 * Creates (or verifies) a single ADMIN account from environment variables.
 *
 * Guardrails:
 * - Refuses to run in production unless ALLOW_PROD_SEED=true is explicitly
 *   set, so it can never be triggered accidentally by a deploy script or a
 *   misconfigured job in a live environment.
 * - Requires SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME to be
 *   set — never falls back to a hardcoded default password.
 * - Is idempotent: if an account with that email already exists, it does
 *   nothing destructive (it does not reset the password or overwrite data).
 */
async function seedAdmin(): Promise<void> {
  if (isProduction && process.env.ALLOW_PROD_SEED !== 'true') {
    throw new Error(
      'Refusing to run the seed script in production. Set ALLOW_PROD_SEED=true if you really intend this.',
    );
  }

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? 'FlowPilot Admin';

  if (!email || !password) {
    throw new Error(
      'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in the environment to run this script.',
    );
  }

  if (password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters long.');
  }

  await connectDatabase();

  const existing = await UserModel.findOne({ email: email.toLowerCase() });
  if (existing) {
    logger.info(`Admin account already exists for ${email} — no changes made.`);
    await disconnectDatabase();
    return;
  }

  const passwordHash = await hashPassword(password);
  await UserModel.create({
    name,
    email,
    passwordHash,
    role: 'ADMIN',
    isActive: true,
  });

  logger.info(`Admin account created for ${email}.`);
  await disconnectDatabase();
}

seedAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(`Seed failed: ${(err as Error).message}`);
    process.exit(1);
  });
