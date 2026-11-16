import { connectDatabase, disconnectDatabase } from '../config/database';
import { env } from '../config/env';
import { assertLocalDemoSeedAllowed, seedDemoWorkspace } from '../services/demoSeedService';
import { logger } from '../utils/logger';

async function main(): Promise<void> {
  assertLocalDemoSeedAllowed({
    nodeEnv: env.nodeEnv,
    mongoUri: env.mongoUri,
    optIn: process.env.ALLOW_LOCAL_DEMO_SEED,
    password: process.env.DEMO_SEED_PASSWORD,
  });

  try {
    await connectDatabase();
    const counts = await seedDemoWorkspace(process.env.DEMO_SEED_PASSWORD as string);
    logger.info('Local demo workspace is ready.', counts);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown seed error';
  logger.error('Local demo seed failed.', { error: message });
  process.exitCode = 1;
});
