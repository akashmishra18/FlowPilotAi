import { AxiosError } from 'axios';

export interface AppApiErrorBody {
  success: false;
  message: string;
  details?: unknown;
}

export interface ParsedApiError {
  /** HTTP status, or null when no response was received (network failure). */
  status: number | null;
  message: string;
  /** Field-level validation messages from a 422 response, keyed by field name. */
  fieldErrors: Record<string, string>;
}

const NETWORK_MESSAGE = "Can't reach the server. Check your connection and try again.";

function readFieldErrors(details: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!Array.isArray(details)) return result;
  for (const item of details) {
    if (item && typeof item === 'object') {
      const { field, message } = item as { field?: unknown; message?: unknown };
      if (typeof field === 'string' && typeof message === 'string' && !(field in result)) {
        result[field] = message;
      }
    }
  }
  return result;
}

/** Normalizes any thrown value into a safe, displayable shape. Never exposes raw error objects or stacks. */
export function parseApiError(err: unknown, fallback = 'Something went wrong. Please try again.'): ParsedApiError {
  if (err instanceof AxiosError) {
    if (!err.response) {
      return { status: null, message: NETWORK_MESSAGE, fieldErrors: {} };
    }
    const body = err.response.data as Partial<AppApiErrorBody> | undefined;
    return {
      status: err.response.status,
      message: body?.message || fallback,
      fieldErrors: readFieldErrors(body?.details),
    };
  }
  return { status: null, message: fallback, fieldErrors: {} };
}

/** Always returns a short, safe-to-display string (backward compatible with earlier phases). */
export function getFriendlyErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return parseApiError(err, fallback).message;
}
