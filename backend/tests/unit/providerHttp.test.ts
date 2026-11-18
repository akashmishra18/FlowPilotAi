import { fetchWithTransientProviderRetry } from '../../src/ai/providerHttp';
import { logger } from '../../src/utils/logger';

const context = { requestId: 'request-safe', provider: 'gemini', model: 'gemini-3.8-flash', apiKey: 'secret-api-key' };
const failedResponse = (status: number, payload: unknown): Response => ({
  ok: false,
  status,
  headers: new Headers({ 'content-type': 'application/json' }),
  clone: () => ({ json: async () => payload }),
} as unknown as Response);

describe('fetchWithTransientProviderRetry', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([429, 500, 503, 599])('retries transient HTTP %s with bounded backoff', async (status) => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(failedResponse(status, { error: { code: 'UNAVAILABLE', status: 'TEMPORARY' } }))
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response);
    const pause = jest.fn().mockResolvedValue(undefined);

    const response = await fetchWithTransientProviderRetry('https://provider.invalid', {}, context, fetcher as typeof fetch, pause);

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledWith(250);
  });

  it.each([400, 401, 403, 404, 422])('does not retry permanent HTTP %s errors', async (status) => {
    const fetcher = jest.fn().mockResolvedValue(failedResponse(status, { error: { code: 'INVALID_ARGUMENT', status: 'INVALID_ARGUMENT', message: 'must not be logged' } }));
    const pause = jest.fn();

    const response = await fetchWithTransientProviderRetry('https://provider.invalid', {}, context, fetcher as typeof fetch, pause);

    expect(response.status).toBe(status);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
  });

  it('stops after three transient failures and logs only safe provider details', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const fetcher = jest.fn().mockResolvedValue(failedResponse(503, {
      error: { code: 'UNAVAILABLE', status: 'TEMPORARY', message: 'secret-api-key private prompt' },
    }));
    const pause = jest.fn().mockResolvedValue(undefined);

    const response = await fetchWithTransientProviderRetry('https://provider.invalid', { body: 'private prompt' }, context, fetcher as typeof fetch, pause);

    expect(response.status).toBe(503);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(pause.mock.calls.map(([delay]) => delay)).toEqual([250, 500]);
    expect(warn).toHaveBeenCalledTimes(3);
    const serializedLogs = JSON.stringify(warn.mock.calls);
    expect(serializedLogs).toContain('UNAVAILABLE');
    expect(serializedLogs).toContain('503');
    expect(serializedLogs).not.toContain('secret-api-key');
    expect(serializedLogs).not.toContain('private prompt');
    expect(serializedLogs).not.toContain('must not be logged');
  });
});
