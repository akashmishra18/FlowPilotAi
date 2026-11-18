import { connectDatabase, disconnectDatabase } from '../config/database';
import { env } from '../config/env';
import { assertProductionDemoProvisioningAllowed, provisionProductionDemoUsers, sanitizeProvisioningError } from '../services/productionDemoProvisioningService';
import { logger } from '../utils/logger';

function parseMode(args: string[]): 'dry-run' | 'execute' {
  const supported = new Set(['--dry-run', '--execute', '--confirm-production-demo-provisioning']);
  if (args.some((arg) => !supported.has(arg))) throw new Error('Unsupported command-line option.');
  if (new Set(args).size !== args.length) throw new Error('Do not repeat command-line options.');
  const dryRun = args.includes('--dry-run');
  const execute = args.includes('--execute');
  if (dryRun === execute) throw new Error('Pass exactly one of --dry-run or --execute.');
  return dryRun ? 'dry-run' : 'execute';
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = parseMode(args);
  assertProductionDemoProvisioningAllowed({
    nodeEnv: env.nodeEnv,
    optIn: process.env.ALLOW_PRODUCTION_DEMO_PROVISIONING,
    mongoUri: env.mongoUri,
    confirmationFlag: args.includes('--confirm-production-demo-provisioning'),
    mode,
  });

  try {
    await connectDatabase();
    const result = await provisionProductionDemoUsers(mode);
    if (result.dryRun) {
      logger.info(`Dry run only: would create ${result.users} users (1 ADMIN, 2 MANAGER, 5 EMPLOYEE) and ${result.employees} employee profiles. No changes made.`);
    } else if (!result.created) {
      logger.info('The complete marked demo account set already exists and is valid. No changes made; credentials are not shown again.');
    } else {
      logger.warn('Provisioning completed and all eight accounts passed login verification. Save these one-time credentials securely; they will not be displayed again.');
      // This is the only output site for generated passwords.
      process.stdout.write(`${JSON.stringify(result.credentials, null, 2)}\n`);
    }
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error: unknown) => {
  logger.error('Production demo provisioning failed.', sanitizeProvisioningError(error));
  process.exitCode = 1;
});
