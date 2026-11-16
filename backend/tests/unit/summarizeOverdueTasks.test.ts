import { summarizeOverdueTasks, OverdueSummaryTask } from '../../src/ai/summarizeOverdueTasks';
import { recordAIUsage } from '../../src/services/aiUsageService';

jest.mock('../../src/services/aiUsageService', () => ({ recordAIUsage: jest.fn().mockResolvedValue(undefined) }));

const overdue: OverdueSummaryTask[] = [
  { title: 'Fix crash', project: { name: 'Shooter', projectCode: 'FP-01' }, assignedEmployee: { name: 'Alex', employeeId: 'FP-10' }, dueDate: '2025-01-01', status: 'TODO' },
];
const configured = { provider: 'openai', apiKey: 'test-key', model: 'test-model' };
const originalFetch = global.fetch;

function mockFetch(implementation: typeof fetch) {
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: jest.fn(implementation) });
  return global.fetch as jest.MockedFunction<typeof fetch>;
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  if (originalFetch) Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: originalFetch });
  else Reflect.deleteProperty(globalThis, 'fetch');
});

describe('summarizeOverdueTasks', () => {
  it('uses a validated OpenAI-compatible response and sends only the supplied overdue tasks', async () => {
    const fetchMock = mockFetch(jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: 'One overdue task, Fix crash, needs attention.' }) } }] }),
    } as Response));

    const result = await summarizeOverdueTasks(overdue, configured);

    expect(result).toEqual({ summary: 'One overdue task, Fix crash, needs attention.', summarySource: 'AI', fallbackReason: null });
    expect(fetchMock).toHaveBeenCalledWith('https://api.openai.com/v1/chat/completions', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      body: expect.stringContaining('Fix crash'),
    }));
    expect(fetchMock.mock.calls[0][1]?.body).not.toContain('FP-10');
    expect(fetchMock.mock.calls[0][1]?.body).not.toContain('FP-01');
  });

  it('records actual provider token usage and provider identifiers for the requesting user', async () => {
    mockFetch(jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'chatcmpl_usage_1',
        model: 'gpt-6-luna',
        usage: { prompt_tokens: 120, completion_tokens: 24, total_tokens: 144, prompt_tokens_details: { cached_tokens: 10 } },
        choices: [{ message: { content: JSON.stringify({ summary: 'One overdue task needs attention.' }) } }],
      }),
    } as Response));

    await summarizeOverdueTasks(overdue, configured, { userId: '507f1f77bcf86cd799439011', requestId: 'request-123' });

    expect(recordAIUsage).toHaveBeenCalledWith(expect.objectContaining({
      userId: '507f1f77bcf86cd799439011',
      provider: 'openai',
      model: 'gpt-6-luna',
      providerRequestId: 'chatcmpl_usage_1',
      requestId: 'request-123',
      promptTokens: 120,
      completionTokens: 24,
      totalTokens: 144,
      cachedPromptTokens: 10,
    }));
  });

  it('uses the configured Gemini-compatible endpoint and records provider-reported token usage', async () => {
    const fetchMock = mockFetch(jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        id: 'gemini-request-1',
        model: 'gemini-3.8-flash',
        usage: { prompt_tokens: 90, completion_tokens: 18, total_tokens: 108 },
        choices: [{ message: { content: '{"summary":"One overdue task needs attention today."}' } }],
      }),
    } as unknown as Response));
    const gemini = {
      provider: 'gemini',
      apiKey: 'test-gemini-key',
      model: 'gemini-3.8-flash',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      pricingTier: 'free',
    };

    await summarizeOverdueTasks(overdue, gemini, { userId: '507f1f77bcf86cd799439011', requestId: 'request-gemini-1' });

    expect(fetchMock).toHaveBeenCalledWith('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-gemini-key' }),
    }));
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(requestBody.temperature).toBeUndefined();
    expect(requestBody.response_format).toBeUndefined();
    expect(recordAIUsage).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      providerRequestId: 'gemini-request-1',
      promptTokens: 90,
      completionTokens: 18,
      totalTokens: 108,
      pricingTier: 'free',
    }));
  });

  it('accepts Gemini native token-count aliases without deriving missing usage', async () => {
    mockFetch(jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: { promptTokenCount: 40, candidatesTokenCount: 9, totalTokenCount: 49, cachedContentTokenCount: 4 },
        choices: [{ message: { content: '{"summary":"One overdue task needs attention today."}' } }],
      }),
    } as Response));

    await summarizeOverdueTasks(overdue, { provider: 'gemini', apiKey: 'test', model: 'gemini-3.8-flash' }, { userId: '507f1f77bcf86cd799439011', requestId: 'request-gemini-2' });

    expect(recordAIUsage).toHaveBeenCalledWith(expect.objectContaining({
      promptTokens: 40,
      completionTokens: 9,
      totalTokens: 49,
      cachedPromptTokens: 4,
      pricingTier: null,
    }));
  });

  it('records unavailable usage for an unparseable successful provider response', async () => {
    mockFetch(jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'provider-request-3' },
      json: async () => { throw new Error('invalid JSON'); },
    } as unknown as Response));

    const result = await summarizeOverdueTasks(overdue, configured, { userId: '507f1f77bcf86cd799439011', requestId: 'request-125' });

    expect(result.summarySource).toBe('RULE_BASED');
    expect(recordAIUsage).toHaveBeenCalledWith(expect.objectContaining({
      providerRequestId: 'provider-request-3',
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      cachedPromptTokens: null,
    }));
  });

  it('does not turn an AI result into an untracked fallback when usage persistence fails', async () => {
    mockFetch(jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'chatcmpl_usage_2', usage: {}, choices: [{ message: { content: '{"summary":"A valid summary for overdue work."}' } }] }),
    } as Response));
    (recordAIUsage as jest.Mock).mockRejectedValueOnce(new Error('database unavailable'));

    await expect(summarizeOverdueTasks(overdue, configured, { userId: '507f1f77bcf86cd799439011', requestId: 'request-124' }))
      .rejects.toThrow('database unavailable');
  });

  it('falls back without making a request when credentials or model are missing', async () => {
    const fetchMock = mockFetch(jest.fn());
    const result = await summarizeOverdueTasks(overdue, { provider: 'openai', apiKey: '', model: 'test-model' });

    expect(result).toEqual({ summary: '1 overdue incomplete task requires attention.', summarySource: 'RULE_BASED', fallbackReason: 'provider_unconfigured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back on provider errors and invalid output', async () => {
    const fetchMock = mockFetch(jest.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"summary":""}' } }] }) } as Response));
    const providerError = await summarizeOverdueTasks(overdue, configured);
    expect(providerError.summarySource).toBe('RULE_BASED');
    expect(providerError.fallbackReason).toBe('provider_error');

    const invalidOutput = await summarizeOverdueTasks(overdue, configured);
    expect(invalidOutput.summarySource).toBe('RULE_BASED');
    expect(invalidOutput.fallbackReason).toBe('invalid_provider_response');
  });

  it('aborts a slow provider request and uses the deterministic summary', async () => {
    jest.useFakeTimers();
    mockFetch(jest.fn((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })));
    const pending = summarizeOverdueTasks(overdue, configured);
    await jest.advanceTimersByTimeAsync(8000);
    await expect(pending).resolves.toMatchObject({ summarySource: 'RULE_BASED', fallbackReason: 'provider_error' });
  });

  it('keeps the deterministic empty result and skips the provider', async () => {
    const fetchMock = mockFetch(jest.fn());
    await expect(summarizeOverdueTasks([], configured)).resolves.toMatchObject({
      summary: 'No overdue incomplete tasks were found in your permitted scope.',
      summarySource: 'RULE_BASED',
      fallbackReason: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
