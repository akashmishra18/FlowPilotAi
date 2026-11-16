import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export type EmailDeliveryStatus = 'SENT' | 'FAILED' | 'NOT_CONFIGURED';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  href: string;
  idempotencyKey: string;
}

export async function sendResendEmail(message: EmailMessage): Promise<EmailDeliveryStatus> {
  const configured = env.email.provider.toLowerCase() === 'resend' && Boolean(env.email.apiKey.trim()) && Boolean(env.email.fromAddress.trim());
  if (!configured) return 'NOT_CONFIGURED';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.email.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: env.email.fromAddress,
        to: [message.to],
        subject: message.subject,
        text: `${message.text}\n\nOpen FlowPilot: ${message.href}`,
        html: `<p>${escapeHtml(message.text)}</p><p><a href="${escapeHtml(message.href)}">Open FlowPilot</a></p>`,
      }),
    });
    if (!response.ok) {
      const providerError = await response.json().catch(() => null) as unknown;
      logger.warn('Resend email request rejected', { status: response.status, ...safeProviderError(providerError) });
      return 'FAILED';
    }
    const result: unknown = await response.json().catch(() => null);
    if (!result || typeof result !== 'object' || typeof (result as { id?: unknown }).id !== 'string') {
      logger.warn('Resend response did not confirm email acceptance', { status: response.status });
      return 'FAILED';
    }
    return 'SENT';
  } catch (error) {
    logger.warn('Resend email request failed', { errorType: error instanceof Error ? error.name : 'UnknownError' });
    return 'FAILED';
  } finally {
    clearTimeout(timeout);
  }
}

function safeProviderError(value: unknown): { providerErrorName?: string; providerErrorMessage?: string; providerErrorCode?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const nested = record.error && typeof record.error === 'object' && !Array.isArray(record.error)
    ? record.error as Record<string, unknown>
    : record;
  const result: { providerErrorName?: string; providerErrorMessage?: string; providerErrorCode?: string } = {};
  if (typeof nested.name === 'string') result.providerErrorName = safeText(nested.name, 80);
  if (typeof nested.message === 'string') result.providerErrorMessage = safeText(nested.message, 200);
  if (typeof nested.code === 'string' || typeof nested.code === 'number') result.providerErrorCode = safeText(String(nested.code), 80);
  return result;
}

function safeText(value: string, maxLength: number): string {
  return value
    .replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:api[_ -]?key|authorization|password|token)\s*[:=]\s*\S+/gi, '[redacted]')
    .slice(0, maxLength);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}
