import { connectDatabase, disconnectDatabase } from '../config/database';
import { env } from '../config/env';
import { seedProductionDemoData } from '../services/productionDemoDataSeedService';
import { logger } from '../utils/logger';

const CONFIRMATION_FLAG = '--confirm-production-demo-data-seed';

function parseMode(args: string[]): 'dry-run' | 'execute' {
  const allowed = new Set(['--dry-run', '--execute', CONFIRMATION_FLAG]);
  if (args.some((arg) => !allowed.has(arg))) throw new Error('Unsupported command-line option.');
  if (new Set(args).size !== args.length) throw new Error('Do not repeat command-line options.');
  const dryRun = args.includes('--dry-run');
  const execute = args.includes('--execute');
  if (dryRun === execute) throw new Error('Pass exactly one of --dry-run or --execute.');
  if (!args.includes(CONFIRMATION_FLAG)) throw new Error(`Pass ${CONFIRMATION_FLAG} to confirm the production target.`);
  if (env.nodeEnv !== 'production') throw new Error('Production demo data seeding requires NODE_ENV=production.');
  if (process.env.ALLOW_PRODUCTION_DEMO_DATA_SEED !== 'true') throw new Error('Set ALLOW_PRODUCTION_DEMO_DATA_SEED=true to opt in.');
  let hostname: string;
  try {
    const uri = new URL(env.mongoUri);
    if (!['mongodb:', 'mongodb+srv:'].includes(uri.protocol)) throw new Error('scheme');
    hostname = uri.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    throw new Error('MONGODB_URI must point to a valid production MongoDB host.');
  }
  if (!hostname || ['localhost', '127.0.0.1', '::1'].includes(hostname)) throw new Error('Production seeding refuses a local MongoDB target.');
  return dryRun ? 'dry-run' : 'execute';
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  try {
    await connectDatabase();
    const result = await seedProductionDemoData(mode);
    if (result.dryRun) {
      logger.info('Production demo data dry run complete; no records were changed.', {
        projectsToCreate: result.projectsCreated,
        tasksToCreate: result.tasksCreated,
        projectsAlreadyPresent: result.projectsAlreadyPresent,
        tasksAlreadyPresent: result.tasksAlreadyPresent,
      });
    } else {
      logger.info('Production demo data seed completed.', {
        projectsCreated: result.projectsCreated,
        tasksCreated: result.tasksCreated,
        projectsAlreadyPresent: result.projectsAlreadyPresent,
        tasksAlreadyPresent: result.tasksAlreadyPresent,
      });
    }
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error: unknown) => {
  const value = error && typeof error === 'object' ? error as { name?: unknown; code?: unknown; message?: unknown } : {};
  const safeName = typeof value.name === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,79}$/.test(value.name) ? value.name : 'Error';
  const safeCode = typeof value.code === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(value.code) ? value.code : null;
  let safeMessage = typeof value.message === 'string' ? value.message : 'Unknown seed failure';
  safeMessage = safeMessage.replace(/\bmongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, '[REDACTED_MONGODB_URI]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]')
    .replace(/(password|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED_SECRET]')
    .replace(/[\r\n\t]+/g, ' ').slice(0, 500);
  logger.error('Production demo data seed failed.', { errorClass: safeName, errorCode: safeCode, message: safeMessage });
  process.exitCode = 1;
});
