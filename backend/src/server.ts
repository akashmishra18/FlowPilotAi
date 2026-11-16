import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { logger } from './utils/logger';
import { startScheduledWorkflows } from './jobs/scheduledWorkflows';

async function bootstrap(): Promise<void> {
  await connectDatabase();
  const stopScheduledWorkflows = await startScheduledWorkflows();

  const app = createApp();

  const server = app.listen(env.port, () => {
    logger.info(`FlowPilot AI backend listening on port ${env.port} [${env.nodeEnv}]`);
  });

  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    stopScheduledWorkflows();
    server.close(async () => {
      logger.info('HTTP server closed');
      await disconnectDatabase();
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', { error: (err as Error).message });
  process.exit(1);
});
