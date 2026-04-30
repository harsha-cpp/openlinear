import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from '../errors';

export interface ValidatedRequest<TBody = unknown, TQuery = unknown> extends Request {
  validBody?: TBody;
  validQuery?: TQuery;
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: ValidatedRequest<T>, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return next(ValidationError.fromZod(parsed.error));
    }
    req.validBody = parsed.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: ValidatedRequest<unknown, T>, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return next(ValidationError.fromZod(parsed.error));
    }
    req.validQuery = parsed.data;
    next();
  };
}
