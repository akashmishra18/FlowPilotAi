import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

const READY_STATE_LABELS: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected');
  });

  mongoose.connection.on('error', (err) => {
    // Never log the connection string itself — it may contain credentials.
    logger.error('MongoDB connection error', { error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  await mongoose.connect(env.mongoUri);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

/** Human-readable connection state, used by the health endpoint. */
export function getDatabaseStatus(): string {
  return READY_STATE_LABELS[mongoose.connection.readyState] ?? 'unknown';
}
