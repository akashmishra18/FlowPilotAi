import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { sendError } from '../utils/apiResponse';
import { isProduction } from '../config/env';

/**
 * Placed last in the middleware chain. Every thrown/next(err) error in the
 * app funnels through here so error responses are consistent and every
 * unexpected error is logged with a stack trace.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    logger.warn(`Handled error: ${err.message}`, { path: req.path, details: err.details });
    sendError(res, err.statusCode, err.message, err.details);
    return;
  }

  const error = err as Error;
  logger.error(`Unhandled error: ${error.message}`, { stack: error.stack, path: req.path });
  sendError(res, 500, isProduction ? 'Internal server error' : error.message);
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
}
