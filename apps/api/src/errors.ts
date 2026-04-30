/**
 * T9: Typed errors for the global error middleware.
 *
 * Discipline mirrors T7's OwnershipError pattern — route handlers throw a
 * typed error, the global errorHandler in app.ts maps it to the wire format.
 * Routes never inline `res.status(400).json(...)` for these conditions.
 *
 * Standardized error envelope across ALL error paths:
 *   { error: string, code: string, details?: any, requestId?: string, ...extras }
 */

import { ZodError } from 'zod';

export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;
  readonly statusCode = 400 as const;
  readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }

  static fromZod(error: ZodError, message = 'Validation failed'): ValidationError {
    return new ValidationError(message, error.flatten());
  }
}

export function isValidationError(err: unknown): err is ValidationError {
  return err instanceof ValidationError;
}

/**
 * Domain-shaped HTTP error for cases that aren't ownership/validation but
 * still need a typed status (e.g. POST /repos/url with malformed URL).
 *
 * Prefer ValidationError or OwnershipError when applicable — only reach for
 * HttpError when neither fits.
 */
export class HttpError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function isHttpError(err: unknown): err is HttpError {
  return err instanceof HttpError;
}
