import { NextFunction, Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { AppError } from '../utils/AppError';

/**
 * Run after express-validator's `.body()/.param()` chains. Turns validation
 * failures into a single consistent 422 response instead of each route
 * handling validation ad hoc.
 */
export function validateRequest(req: Request, _res: Response, next: NextFunction): void {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    throw new AppError(
      'Validation failed',
      422,
      result.array().map((e) => ({ field: 'path' in e ? e.path : undefined, message: e.msg })),
    );
  }
  next();
}
