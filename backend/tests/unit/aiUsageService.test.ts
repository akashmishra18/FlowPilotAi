import { Types } from 'mongoose';
import { calculateEstimatedCost, getAIUsageAnalytics, recordAIUsage } from '../../src/services/aiUsageService';

jest.mock('../../src/models/AIUsageEvent');
jest.mock('../../src/models/Employee');
jest.mock('../../src/models/User');

import { AIUsageEventModel } from '../../src/models/AIUsageEvent';
import { EmployeeModel } from '../../src/models/Employee';
import { UserModel } from '../../src/models/User';

const events = AIUsageEventModel as jest.Mocked<typeof AIUsageEventModel>;
const employees = EmployeeModel as jest.Mocked<typeof EmployeeModel>;
const users = UserModel as jest.Mocked<typeof UserModel>;
const adminId = new Types.ObjectId();
const managerId = new Types.ObjectId();
const managerEmployeeId = new Types.ObjectId();
const reportA = new Types.ObjectId();
const reportB = new Types.ObjectId();
const outsideUser = new Types.ObjectId();

function queryResult(value: unknown) {
  return { select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }) };
}

beforeEach(() => jest.resetAllMocks());

describe('AI usage event accounting', () => {
  it('estimates standard and cached input using an exact maintained model rate', () => {
    expect(calculateEstimatedCost({ provider: 'openai', model: 'gpt-6-luna', promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000, cachedPromptTokens: 0, pricingTier: null }))
      .toMatchObject({ estimatedCostUsd: 0.6, pricingVersion: 'openai-standard-2026-11-13' });
    expect(calculateEstimatedCost({ provider: 'openai', model: 'gpt-6-luna', promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000, cachedPromptTokens: 500_000, pricingTier: null }))
      .toMatchObject({ estimatedCostUsd: 0.055 });
  });

  it('prices Gemini at zero only with explicit free tier and complete provider usage', () => {
    const usage = { provider: 'gemini', model: 'gemini-3.8-flash', promptTokens: 20, completionTokens: 5, totalTokens: 25, cachedPromptTokens: null } as const;
    expect(calculateEstimatedCost({ ...usage, pricingTier: 'free' })).toMatchObject({ estimatedCostUsd: 0, pricingVersion: 'gemini-free-tier-2026-11-13', pricingTier: 'free' });
    expect(calculateEstimatedCost({ ...usage, pricingTier: null })).toBeNull();
    expect(calculateEstimatedCost({ ...usage, pricingTier: 'free', totalTokens: null })).toBeNull();
    expect(calculateEstimatedCost({ ...usage, pricingTier: 'free', model: 'unknown-gemini-model' })).toBeNull();
    expect(calculateEstimatedCost({ ...usage, pricingTier: 'free', model: 'gpt-6-luna' })).toBeNull();
  });

  it('leaves cost unavailable for unknown models or incomplete provider usage', () => {
    expect(calculateEstimatedCost({ provider: 'openai', model: 'custom-model', promptTokens: 100, completionTokens: 20, totalTokens: 120, cachedPromptTokens: 0, pricingTier: null })).toBeNull();
    expect(calculateEstimatedCost({ provider: 'openai', model: 'gpt-6-luna', promptTokens: null, completionTokens: 20, totalTokens: 20, cachedPromptTokens: 0, pricingTier: null })).toBeNull();
    expect(calculateEstimatedCost({ provider: 'openai', model: 'gpt-6-luna', promptTokens: 100, completionTokens: 20, totalTokens: 120, cachedPromptTokens: null, pricingTier: null })).toBeNull();
  });

  it('upserts a provider response using a stable provider-request deduplication key', async () => {
    events.updateOne.mockResolvedValue({ acknowledged: true } as never);
    await recordAIUsage({ userId: adminId.toString(), provider: 'openai', model: 'gpt-6-luna', providerRequestId: 'chatcmpl-1', requestId: 'req-1', promptTokens: 100, completionTokens: 20, totalTokens: 120, cachedPromptTokens: 0 });
    expect(events.updateOne).toHaveBeenCalledWith(
      { provider: 'openai', dedupeKey: 'provider:chatcmpl-1' },
      { $setOnInsert: expect.objectContaining({ userId: adminId, modelName: 'gpt-6-luna', promptTokens: 100, completionTokens: 20, totalTokens: 120, estimatedCostUsd: expect.any(Number) }) },
      { upsert: true },
    );
  });

  it('treats a concurrent duplicate-key upsert as an already-recorded event', async () => {
    events.updateOne.mockRejectedValue({ code: 11000 } as never);
    await expect(recordAIUsage({ userId: adminId.toString(), provider: 'openai', model: 'gpt-6-luna', providerRequestId: 'chatcmpl-duplicate', requestId: 'req-duplicate', promptTokens: null, completionTokens: null, totalTokens: null, cachedPromptTokens: null })).resolves.toBeUndefined();
  });
});

describe('AI usage role scope and aggregations', () => {
  const aggregation = {
    totals: [{ requestCount: 1, promptTokensSum: 20, promptTokensMissing: 0, completionTokensSum: 5, completionTokensMissing: 0, totalTokensSum: 25, totalTokensMissing: 0, estimatedCostUsdSum: 0.00001, estimatedCostUsdMissing: 0 }],
    trend: [{ _id: '2026-11-13', requestCount: 1, promptTokensSum: 20, promptTokensMissing: 0, completionTokensSum: 5, completionTokensMissing: 0, totalTokensSum: 25, totalTokensMissing: 0, estimatedCostUsdSum: 0.00001, estimatedCostUsdMissing: 0 }],
    providerModels: [{ _id: { provider: 'openai', modelName: 'gpt-6-luna' }, requestCount: 1, promptTokensSum: 20, promptTokensMissing: 0, completionTokensSum: 5, completionTokensMissing: 0, totalTokensSum: 25, totalTokensMissing: 0, estimatedCostUsdSum: 0.00001, estimatedCostUsdMissing: 0 }],
    users: [{ _id: reportA, requestCount: 1, promptTokensSum: 20, promptTokensMissing: 0, completionTokensSum: 5, completionTokensMissing: 0, totalTokensSum: 25, totalTokensMissing: 0, estimatedCostUsdSum: 0.00001, estimatedCostUsdMissing: 0 }],
  };

  it('limits manager aggregates to employees linked through Employee.managerId', async () => {
    employees.findOne.mockReturnValue(queryResult({ _id: managerEmployeeId }) as never);
    employees.find.mockReturnValue(queryResult([{ userId: reportA }, { userId: reportB }]) as never);
    users.find.mockReturnValue(queryResult([{ _id: reportA, name: 'Report A', role: 'EMPLOYEE' }, { _id: reportB, name: 'Report B', role: 'EMPLOYEE' }]) as never);
    events.aggregate.mockResolvedValue([aggregation] as never);

    const result = await getAIUsageAnalytics({ id: managerId.toString(), role: 'MANAGER' }, 'daily', new Date('2026-11-13T12:00:00.000Z'));
    const pipeline = events.aggregate.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
    expect((pipeline[0].$match as Record<string, unknown>).userId).toEqual({ $in: [reportA, reportB] });
    expect(result.users.map((item) => item.userId)).toEqual([reportA.toString(), reportB.toString()]);
    expect(result.summary.totalTokens).toBe(25);
    expect(result.trend[0].date).toBe('2026-11-13');
    expect(result.providerModels[0].provider).toBe('openai');
    expect(result.users.some((item) => item.userId === outsideUser.toString())).toBe(false);
  });

  it('limits employee analytics to the authenticated employee account', async () => {
    users.find.mockReturnValue(queryResult([{ _id: adminId, name: 'Employee', role: 'EMPLOYEE' }]) as never);
    events.aggregate.mockResolvedValue([aggregation] as never);
    await getAIUsageAnalytics({ id: adminId.toString(), role: 'EMPLOYEE' }, 'weekly', new Date('2026-11-13T12:00:00.000Z'));
    const pipeline = events.aggregate.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
    expect((pipeline[0].$match as Record<string, unknown>).userId).toEqual({ $in: [adminId] });
  });

  it('leaves admin aggregation organization-wide and retains unavailable metrics as null', async () => {
    users.find.mockReturnValue(queryResult([{ _id: adminId, name: 'Admin', role: 'ADMIN' }]) as never);
    events.aggregate.mockResolvedValue([{
      ...aggregation,
      totals: [{ requestCount: 1, promptTokensSum: 0, promptTokensMissing: 1, completionTokensSum: 0, completionTokensMissing: 1, totalTokensSum: 0, totalTokensMissing: 1, estimatedCostUsdSum: 0, estimatedCostUsdMissing: 1 }],
    }] as never);
    const result = await getAIUsageAnalytics({ id: adminId.toString(), role: 'ADMIN' }, 'monthly', new Date('2026-11-13T12:00:00.000Z'));
    const pipeline = events.aggregate.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
    expect((pipeline[0].$match as Record<string, unknown>).userId).toBeUndefined();
    expect(result.summary.totalTokens).toBeNull();
    expect(result.summary.estimatedCostUsd).toBeNull();
  });
});
