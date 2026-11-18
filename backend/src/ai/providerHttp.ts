import { logger } from '../utils/logger';

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [250, 500];

function safeProviderCode(value: unknown, apiKey: string): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const candidate = String(value);
  if (candidate.length > 64 || (apiKey && candidate.includes(apiKey))) return null;
  return /^(?:[A-Z][A-Z0-9_]{0,63}|\d{1,5})$/.test(candidate) ? candidate : null;
}

async function readSafeErrorCodes(response: Response, apiKey: string): Promise<{ providerErrorCode: string | null; providerErrorStatus: string | null }> {
  try {
    const payload = await response.clone().json() as { error?: { code?: unknown; status?: unknown } };
    return {
      providerErrorCode: safeProviderCode(payload?.error?.code, apiKey),
      providerErrorStatus: safeProviderCode(payload?.error?.status, apiKey),
    };
  } catch {
    return { providerErrorCode: null, providerErrorStatus: null };
  }
}

export async function fetchWithTransientProviderRetry(
  input: string | URL,
  init: RequestInit,
  context: { requestId: string; provider: string; model: string; apiKey: string },
  fetcher: typeof fetch = fetch,
  pause: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<Response> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetcher(input, init);
    if (response.ok) return response;

    const retryable = response.status === 429 || (response.status >= 500 && response.status <= 599);
    const errorCodes = await readSafeErrorCodes(response, context.apiKey);
    logger.warn('Agent provider request failed', {
      requestId: context.requestId,
      provider: context.provider,
      model: context.model,
      httpStatus: response.status,
      attempt,
      retryable,
      ...errorCodes,
      responseContentType: response.headers?.get?.('content-type') ?? null,
    });

    if (!retryable || attempt === MAX_ATTEMPTS) return response;
    await pause(RETRY_DELAYS_MS[attempt - 1]);
  }

  // The loop always returns or throws before reaching this point.
  throw new Error('Provider retry loop ended unexpectedly');
}
