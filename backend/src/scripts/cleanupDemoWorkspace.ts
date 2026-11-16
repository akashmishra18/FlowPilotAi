import { connectDatabase, disconnectDatabase } from '../config/database';
import { env } from '../config/env';
import { assertLocalDemoCleanupAllowed, cleanupDemoWorkspace } from '../services/demoSeedService';
import { logger } from '../utils/logger';

async function main(): Promise<void> {
  assertLocalDemoCleanupAllowed({
    nodeEnv: env.nodeEnv,
    mongoUri: env.mongoUri,
    confirmation: process.env.CONFIRM_LOCAL_DEMO_CLEANUP,
  });

  try {
    await connectDatabase();
    const counts = await cleanupDemoWorkspace();
    logger.info('Local demo records were cleaned up. Audit history was preserved.', counts);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown cleanup error';
  logger.error('Local demo cleanup failed.', { error: message });
  process.exitCode = 1;
});
