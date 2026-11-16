import { summarizeOverdueTasks, OverdueSummaryTask } from '../../src/ai/summarizeOverdueTasks';
import { AIUsageEventModel } from '../../src/models/AIUsageEvent';

jest.mock('../../src/models/AIUsageEvent', () => ({
  AIUsageEventModel: { updateOne: jest.fn().mockResolvedValue({ acknowledged: true }) },
}));
jest.mock('../../src/models/Employee');
jest.mock('../../src/models/User');

const usageEvents = AIUsageEventModel as jest.Mocked<typeof AIUsageEventModel>;
const originalFetch = global.fetch;

afterEach(() => {
  jest.restoreAllMocks();
  if (originalFetch) Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: originalFetch });
  else Reflect.deleteProperty(globalThis, 'fetch');
});

it('persists a successful Gemini response and its provider-reported usage through the real usage service', async () => {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        id: 'gemini-provider-request-verified',
        model: 'gemini-3.8-flash',
        usage: { prompt_tokens: 70, completion_tokens: 15, total_tokens: 85 },
        choices: [{ message: { content: '{"summary":"One overdue task requires attention this week."}' } }],
      }),
    } as unknown as Response),
  });

  const tasks: OverdueSummaryTask[] = [{ title: 'Review build', project: null, assignedEmployee: null, dueDate: '2026-11-12', status: 'TODO' }];
  const result = await summarizeOverdueTasks(tasks, {
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    apiKey: 'test-only-key',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    pricingTier: 'free',
  }, { userId: '507f1f77bcf86cd799439011', requestId: 'flow-gemini-1' });

  expect(result.summarySource).toBe('AI');
  expect(usageEvents.updateOne).toHaveBeenCalledWith(
    { provider: 'gemini', dedupeKey: 'provider:gemini-provider-request-verified' },
    { $setOnInsert: expect.objectContaining({
      provider: 'gemini',
      modelName: 'gemini-3.8-flash',
      promptTokens: 70,
      completionTokens: 15,
      totalTokens: 85,
      estimatedCostUsd: 0,
      pricingVersion: 'gemini-free-tier-2026-11-13',
      pricingTier: 'free',
    }) },
    { upsert: true },
  );
});
