import { PipelineStage, Types } from 'mongoose';
import { Role } from '../config/constants';
import { AIUsageEventModel } from '../models/AIUsageEvent';
import { EmployeeModel } from '../models/Employee';
import { UserModel } from '../models/User';
import { AI_MODEL_PRICING, AI_MODEL_PRICING_VERSION, GEMINI_FREE_PRICING_VERSION, GEMINI_FREE_TIER_MODELS } from '../ai/modelPricing';

export type AIUsagePeriod = 'daily' | 'weekly' | 'monthly';
export interface UsageActor { id: string; role: Role }

export interface ProviderUsageInput {
  userId: string;
  provider: string;
  model: string;
  providerRequestId?: string | null;
  requestId: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cachedPromptTokens?: number | null;
  pricingTier?: string | null;
  recordedAt?: Date;
}

export function calculateEstimatedCost(input: Pick<ProviderUsageInput, 'provider' | 'model' | 'promptTokens' | 'completionTokens' | 'totalTokens' | 'cachedPromptTokens' | 'pricingTier'>) {
  if (
    input.provider === 'gemini'
    && input.pricingTier?.trim().toLowerCase() === 'free'
    && GEMINI_FREE_TIER_MODELS[input.model]
    && input.promptTokens !== null
    && input.completionTokens !== null
    && input.totalTokens !== null
  ) {
    return {
      estimatedCostUsd: 0,
      pricingVersion: GEMINI_FREE_PRICING_VERSION,
      pricingTier: 'free',
      inputUsdPerMillion: 0,
      cachedInputUsdPerMillion: null,
      outputUsdPerMillion: 0,
    };
  }
  const pricing = input.provider === 'openai' ? AI_MODEL_PRICING[input.model] : undefined;
  if (!pricing || input.promptTokens === null || input.completionTokens === null) return null;
  if (input.cachedPromptTokens === null || input.cachedPromptTokens === undefined) return null;
  const cachedPromptTokens = input.cachedPromptTokens;
  if (!Number.isSafeInteger(cachedPromptTokens) || cachedPromptTokens < 0 || cachedPromptTokens > input.promptTokens) return null;

  const uncachedInputTokens = input.promptTokens - cachedPromptTokens;
  const estimate = (
    uncachedInputTokens * pricing.inputUsdPerMillion
    + cachedPromptTokens * pricing.cachedInputUsdPerMillion
    + input.completionTokens * pricing.outputUsdPerMillion
  ) / 1_000_000;
  return {
    estimatedCostUsd: estimate,
    pricingVersion: AI_MODEL_PRICING_VERSION,
    pricingTier: 'standard',
    inputUsdPerMillion: pricing.inputUsdPerMillion,
    cachedInputUsdPerMillion: pricing.cachedInputUsdPerMillion,
    outputUsdPerMillion: pricing.outputUsdPerMillion,
  };
}

/** Store provider-reported usage only. The unique provider+dedupe key makes retries idempotent. */
export async function recordAIUsage(input: ProviderUsageInput): Promise<void> {
  if (!Types.ObjectId.isValid(input.userId)) throw new Error('A valid user is required to record AI usage');
  const providerRequestId = input.providerRequestId?.trim() || null;
  const dedupeKey = providerRequestId ? `provider:${providerRequestId}` : `request:${input.requestId}`;
  const cost = calculateEstimatedCost(input);
  const { model, ...usageFields } = input;
  const document = {
    ...usageFields,
    modelName: model,
    userId: new Types.ObjectId(input.userId),
    providerRequestId,
    dedupeKey,
    recordedAt: input.recordedAt ?? new Date(),
    cachedPromptTokens: input.cachedPromptTokens ?? null,
    estimatedCostUsd: cost?.estimatedCostUsd ?? null,
    pricingVersion: cost?.pricingVersion ?? null,
    pricingTier: cost?.pricingTier ?? null,
    inputUsdPerMillion: cost?.inputUsdPerMillion ?? null,
    cachedInputUsdPerMillion: cost?.cachedInputUsdPerMillion ?? null,
    outputUsdPerMillion: cost?.outputUsdPerMillion ?? null,
  };
  try {
    await AIUsageEventModel.updateOne(
      { provider: input.provider, dedupeKey },
      { $setOnInsert: document },
      { upsert: true },
    );
  } catch (error) {
    // A concurrent upsert may lose the unique-index race. Treat that as the same
    // already-recorded request; surface every other persistence failure.
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}

function utcStart(period: AIUsagePeriod, now: Date): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === 'daily') {
    start.setUTCDate(start.getUTCDate() - 29);
  } else if (period === 'weekly') {
    const daysSinceMonday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - daysSinceMonday - 77);
  } else {
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - 11);
  }
  return start;
}

function metricFields(prefix = ''): Record<string, unknown> {
  const field = (name: string) => prefix ? `$${prefix}.${name}` : `$${name}`;
  const metric = (name: string) => ({
    [`${name}Sum`]: { $sum: { $cond: [{ $isNumber: field(name) }, field(name), 0] } },
    [`${name}Missing`]: { $sum: { $cond: [{ $isNumber: field(name) }, 0, 1] } },
  });
  return {
    requestCount: { $sum: 1 },
    ...metric('promptTokens'),
    ...metric('completionTokens'),
    ...metric('totalTokens'),
    ...metric('estimatedCostUsd'),
  };
}

function normalizeMetrics(row: Record<string, number> | undefined) {
  const value = row ?? {} as Record<string, number>;
  const metric = (name: string) => value[`${name}Missing`] ? null : value[`${name}Sum`] ?? 0;
  return {
    requestCount: value.requestCount ?? 0,
    promptTokens: metric('promptTokens'),
    completionTokens: metric('completionTokens'),
    totalTokens: metric('totalTokens'),
    estimatedCostUsd: metric('estimatedCostUsd'),
  };
}

/** Role scope is derived from Employee.managerId in the service, never from caller filters. */
export async function getAIUsageAnalytics(actor: UsageActor, period: AIUsagePeriod, now = new Date()) {
  let visibleUserIds: Types.ObjectId[] | null = null;
  if (actor.role === 'EMPLOYEE' || actor.role === 'TEAM_LEAD') {
    if (!Types.ObjectId.isValid(actor.id)) visibleUserIds = [];
    else visibleUserIds = [new Types.ObjectId(actor.id)];
  } else if (actor.role === 'MANAGER') {
    const manager = await EmployeeModel.findOne({ userId: actor.id }).select('_id').lean() as { _id: Types.ObjectId } | null;
    if (!manager) visibleUserIds = [];
    else {
      const reports = await EmployeeModel.find({ managerId: manager._id }).select('userId').lean() as Array<{ userId: Types.ObjectId }>;
      visibleUserIds = reports.map((employee) => employee.userId);
    }
  }

  const start = utcStart(period, now);
  const end = new Date(now);
  const match: Record<string, unknown> = { recordedAt: { $gte: start, $lte: end } };
  if (visibleUserIds !== null) match.userId = { $in: visibleUserIds };
  const dateFormat = period === 'monthly' ? '%Y-%m' : '%Y-%m-%d';
  const dateKey = period === 'weekly'
    ? { $dateToString: { format: '%Y-%m-%d', date: { $dateTrunc: { date: '$recordedAt', unit: 'week', startOfWeek: 'monday' } } } }
    : { $dateToString: { format: dateFormat, date: '$recordedAt' } };

  const summarize = (groupId: unknown): PipelineStage[] => [
    { $group: { _id: groupId, ...metricFields() } },
  ];
  const pipeline = [
    { $match: match },
    { $facet: {
      totals: summarize(null),
      trend: [{ $group: { _id: dateKey, ...metricFields() } }, { $sort: { _id: 1 } }],
      providerModels: [{ $group: { _id: { provider: '$provider', modelName: '$modelName' }, ...metricFields() } }, { $sort: { '_id.provider': 1, '_id.modelName': 1 } }],
      users: [{ $group: { _id: '$userId', ...metricFields() } }],
    } },
  ] as PipelineStage[];
  const [result] = await AIUsageEventModel.aggregate(pipeline);
  const totalsRow = result?.totals?.[0];
  const usageRows = result?.users ?? [];
  let visibleUsers: Array<{ _id: Types.ObjectId; name: string; role: Role }>;
  if (actor.role === 'ADMIN') {
    visibleUsers = await UserModel.find(visibleUserIds === null ? {} : { _id: { $in: visibleUserIds } }).select('name role').lean() as typeof visibleUsers;
  } else if (visibleUserIds && visibleUserIds.length > 0) {
    visibleUsers = await UserModel.find({ _id: { $in: visibleUserIds } }).select('name role').lean() as typeof visibleUsers;
  } else {
    visibleUsers = [];
  }

  const metricsByUser = new Map<string, Record<string, number>>(
    usageRows.map((row: Record<string, unknown>) => [String(row._id), row as Record<string, number>]),
  );
  const allVisibleUsers = visibleUsers.map((user) => ({
    userId: String(user._id),
    name: user.name,
    role: user.role,
    ...normalizeMetrics(metricsByUser.get(String(user._id))),
  }));

  return {
    period,
    window: { start: start.toISOString(), end: end.toISOString(), timezone: 'UTC' },
    summary: normalizeMetrics(totalsRow),
    trend: (result?.trend ?? []).map((row: Record<string, unknown>) => ({ date: row._id, ...normalizeMetrics(row as Record<string, number>) })),
    providerModels: (result?.providerModels ?? []).map((row: Record<string, unknown>) => ({
      provider: (row._id as { provider: string }).provider,
      model: (row._id as { modelName: string }).modelName,
      ...normalizeMetrics(row as Record<string, number>),
    })),
    users: allVisibleUsers,
  };
}
