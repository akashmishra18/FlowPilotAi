import { createInterface } from 'readline/promises';
import { stdin, stdout } from 'process';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { env } from '../config/env';
import { updateExistingAdminEmail } from '../services/adminEmailUpdateService';

function assertLocalDevelopment(): void {
  if (env.nodeEnv === 'production') throw new Error('This one-time email update is disabled in production.');
  const uri = new URL(env.mongoUri);
  const localHosts = ['localhost', '127.0.0.1', '::1'];
  if (!['mongodb:', 'mongodb+srv:'].includes(uri.protocol) || !localHosts.includes(uri.hostname)) {
    throw new Error('This one-time email update is restricted to a local MongoDB instance.');
  }
}

async function main(): Promise<void> {
  assertLocalDevelopment();
  const userId = process.argv[2]?.trim();
  if (!userId) throw new Error('Pass the existing Admin User ID as the command argument.');
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const email = (await terminal.question('New Admin Gmail address: ')).trim();
    const confirm = await terminal.question('Type UPDATE to confirm changing the existing Admin login email: ');
    if (confirm !== 'UPDATE') throw new Error('Confirmation did not match. No changes made.');
    await connectDatabase();
    await updateExistingAdminEmail(userId, email);
    stdout.write('Existing Admin login email updated.\n');
  } finally {
    terminal.close();
    await disconnectDatabase();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown local Admin email update error';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
