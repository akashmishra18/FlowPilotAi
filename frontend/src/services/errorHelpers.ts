import { AxiosError } from 'axios';

export interface AppApiErrorBody {
  success: false;
  message: string;
  details?: unknown;
}

/**
 * Always returns a short, safe-to-display string. Falls back to a generic
 * message rather than ever surfacing a raw error object, network detail,
 * or stack trace to the UI.
 */
export function getFriendlyErrorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (err instanceof AxiosError) {
    const body = err.response?.data as AppApiErrorBody | undefined;
    if (body?.message) return body.message;
  }
  return fallback;
}
