import { connectDatabase, disconnectDatabase } from '../config/database';
import { env } from '../config/env';
import { assertDemoPasswordResetAllowed, resetDemoAccountPasswords } from '../services/demoPasswordResetService';
import { logger } from '../utils/logger';

async function main(): Promise<void> {
  assertDemoPasswordResetAllowed({
    nodeEnv: env.nodeEnv,
    mongoUri: env.mongoUri,
    optIn: process.env.ALLOW_LOCAL_DEMO_PASSWORD_RESET,
    password: process.env.DEMO_SEED_PASSWORD,
  });

  try {
    await connectDatabase();
    const updated = await resetDemoAccountPasswords(process.env.DEMO_SEED_PASSWORD as string);
    logger.info('Password reset completed for the exact local demo accounts.', { accountsUpdated: updated });
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown password reset error';
  logger.error('Local demo account password reset failed.', { error: message });
  process.exitCode = 1;
});
