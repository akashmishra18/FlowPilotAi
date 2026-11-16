jest.mock('../../src/config/env', () => ({ env: { email: { provider: 'resend', apiKey: 'test-key-never-logged', fromAddress: 'FlowPilot <team@example.test>' } } }));
jest.mock('../../src/utils/logger', () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));

import { env } from '../../src/config/env';
import { sendResendEmail } from '../../src/integrations/email/resendEmailProvider';
import { logger } from '../../src/utils/logger';

const message = { to: 'recipient@example.test', subject: 'Task update', text: 'A task needs attention.', href: 'http://localhost:5173/tasks', idempotencyKey: 'notification-123' };
const fetchMock = jest.fn();

beforeEach(() => {
  jest.restoreAllMocks();
  global.fetch = fetchMock;
  fetchMock.mockReset();
});

it('sends through Resend and requires provider acceptance with an id', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'resend-id' }) });
  await expect(sendResendEmail(message)).resolves.toBe('SENT');
  expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
    headers: expect.objectContaining({ 'Idempotency-Key': message.idempotencyKey, Authorization: `Bearer ${env.email.apiKey}` }),
  }));
});

it('marks a rejected response as failed without exposing response content', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({ name: 'rate_limit', message: 'Rate limit reached for recipient@example.test', code: 'rate_limit' }) });
  await expect(sendResendEmail(message)).resolves.toBe('FAILED');
  expect(logger.warn).toHaveBeenCalledWith('Resend email request rejected', {
    status: 429, providerErrorName: 'rate_limit', providerErrorMessage: 'Rate limit reached for [redacted-email]', providerErrorCode: 'rate_limit',
  });
});

it.each([400, 401, 403, 422])('logs safe error fields for Resend HTTP %s', async (status) => {
  fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({ error: { name: 'validation_error', message: 'Invalid sender', code: 'sender_invalid' }, to: 'private@example.test' }) });
  await expect(sendResendEmail(message)).resolves.toBe('FAILED');
  expect(logger.warn).toHaveBeenCalledWith('Resend email request rejected', { status, providerErrorName: 'validation_error', providerErrorMessage: 'Invalid sender', providerErrorCode: 'sender_invalid' });
});

it('keeps malformed error responses failed and logs only the HTTP status', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => { throw new SyntaxError('malformed body'); } });
  await expect(sendResendEmail(message)).resolves.toBe('FAILED');
  expect(logger.warn).toHaveBeenCalledWith('Resend email request rejected', { status: 400 });
});

it('redacts authorization data and email addresses from provider messages', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: 'Bearer secret-token rejected for user@example.test' }) });
  await sendResendEmail(message);
  expect(logger.warn).toHaveBeenCalledWith('Resend email request rejected', { status: 401, providerErrorMessage: '[redacted] rejected for [redacted-email]' });
});

it('aborts timed out requests and reports failure', async () => {
  jest.useFakeTimers();
  fetchMock.mockImplementation((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  const pending = sendResendEmail(message);
  await jest.advanceTimersByTimeAsync(8000);
  await expect(pending).resolves.toBe('FAILED');
  jest.useRealTimers();
});

it('reports missing configuration without attempting delivery', async () => {
  const config = env.email as { provider: string; apiKey: string; fromAddress: string };
  config.apiKey = '';
  await expect(sendResendEmail(message)).resolves.toBe('NOT_CONFIGURED');
  expect(fetchMock).not.toHaveBeenCalled();
  config.apiKey = 'test-key-never-logged';
});
