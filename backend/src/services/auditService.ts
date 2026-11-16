import mongoose, { Types } from 'mongoose';
import { AuditEventModel, AuditOutcome } from '../models/AuditEvent';
import { Role } from '../config/constants';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

interface RequestingUser { id: string; role: Role }

export interface AuditEventInput {
  actorUserId?: string | null;
  actorRole?: Role | null;
  action: string;
  targetType: string;
  targetId: string;
  outcome: AuditOutcome;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  error?: { code?: string; message: string } | null;
}

function sanitize(value: unknown, depth = 0): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (depth > 3 || typeof value !== 'object') return { value: String(value) };
  const blocked = /password|token|secret|apiKey|authorization|cookie/i;
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (blocked.test(key)) continue;
    if (raw instanceof Date || raw instanceof Types.ObjectId) result[key] = String(raw);
    else if (Array.isArray(raw)) result[key] = raw.slice(0, 100).map((item) => sanitize(item, depth + 1));
    else if (raw && typeof raw === 'object') result[key] = sanitize(raw, depth + 1);
    else if (['string', 'number', 'boolean'].includes(typeof raw)) result[key] = raw;
  }
  return result;
}

export async function recordAuditEvent(input: AuditEventInput, session?: mongoose.ClientSession): Promise<void> {
  const actorUserId = input.actorUserId && Types.ObjectId.isValid(input.actorUserId) ? input.actorUserId : null;
  const document = {
    actorUserId,
    actorRole: input.actorRole ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    outcome: input.outcome,
    before: sanitize(input.before),
    after: sanitize(input.after),
    requestId: input.requestId ?? null,
    error: input.error ? { code: input.error.code, message: input.error.message.slice(0, 500) } : null,
  };
  if (session) await AuditEventModel.create([document], { session });
  else await AuditEventModel.create(document);
}

/** Failure events must not replace the original business error; persistence failures are surfaced to logs for reconciliation. */
export async function recordAuditFailure(input: Omit<AuditEventInput, 'outcome'>): Promise<void> {
  try {
    await recordAuditEvent({ ...input, outcome: 'FAILURE' });
  } catch (error) {
    logger.error('Failed to persist audit failure event', { action: input.action, targetType: input.targetType, targetId: input.targetId, error: (error as Error).message });
  }
}

export async function listAuditEvents(requestingUser: RequestingUser, filters: { page?: number; limit?: number } = {}) {
  if (requestingUser.role !== 'ADMIN') throw new AppError('Only an admin can view audit events', 403);
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
  const query = AuditEventModel.find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
  const [events, total] = await Promise.all([query, AuditEventModel.countDocuments({})]);
  return { events, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}
