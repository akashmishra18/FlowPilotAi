/**
 * Use this for any expected/operational failure (validation, not found,
 * forbidden, conflict, etc.) so the global error handler can distinguish
 * "a normal rejected request" from "an actual bug/crash".
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
