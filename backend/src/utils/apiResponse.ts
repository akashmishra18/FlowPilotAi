import { Response } from 'express';

/**
 * Consistent response envelope across every endpoint, so the frontend
 * (and the AI tool layer parsing service results) can rely on one shape.
 */
export function sendSuccess<T>(res: Response, data: T, status = 200, message?: string): Response {
  return res.status(status).json({
    success: true,
    message: message ?? null,
    data,
  });
}

export function sendError(res: Response, status: number, message: string, details?: unknown): Response {
  return res.status(status).json({
    success: false,
    message,
    details: details ?? null,
  });
}
