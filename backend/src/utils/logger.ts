import winston from 'winston';
import { env } from '../config/env';

/**
 * General application logger (server events, errors, request logs).
 * NOTE: This is distinct from the future `auditLogger` (Phase 6+),
 * which will persist a permanent, queryable trail of every automated
 * and AI-driven action to MongoDB. Application logs are for operators;
 * audit logs are a compliance/traceability record and must never be
 * dropped, rotated away, or skipped on error paths.
 */
export const logger = winston.createLogger({
  level: env.logLevel,
  silent: env.nodeEnv === 'test',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    env.nodeEnv === 'production' ? winston.format.json() : winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] ${level}: ${message}${metaStr}`;
      }),
    ),
  ),
  transports: [new winston.transports.Console()],
});
