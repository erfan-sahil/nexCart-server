import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../config/env';
import type { ApiErrorResponse } from '../types';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

type BodyParserError = Error & {
  status?: number;
  statusCode?: number;
  type?: string;
};

const isBodyParserError = (err: Error): err is BodyParserError => {
  return 'type' in err || 'status' in err || 'statusCode' in err;
};

const normalizeError = (err: Error): AppError => {
  if (err instanceof AppError) {
    return err;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.') || 'root',
      message: issue.message,
    }));

    return AppError.validation('Validation failed', details);
  }

  if (
    err instanceof SyntaxError ||
    (isBodyParserError(err) && err.type === 'entity.parse.failed')
  ) {
    return AppError.badRequest('Invalid JSON payload');
  }

  if (isBodyParserError(err) && err.type === 'entity.too.large') {
    return AppError.payloadTooLarge();
  }

  if (err instanceof URIError) {
    return AppError.badRequest('Malformed URL');
  }

  if (isBodyParserError(err) && (err.status === 400 || err.statusCode === 400)) {
    return AppError.badRequest(err.message || 'Bad request');
  }

  return AppError.internal(isProduction ? 'Internal server error' : err.message);
};

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response<ApiErrorResponse>,
  next: NextFunction,
) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const normalized = normalizeError(err);
  const requestId = req.requestId ?? 'unknown';

  if (!normalized.isOperational || normalized.statusCode >= 500) {
    logger.error(normalized.message, {
      requestId,
      method: req.method,
      path: req.path,
      code: normalized.code,
      err,
    });
  } else {
    logger.warn(normalized.message, {
      requestId,
      method: req.method,
      path: req.path,
      code: normalized.code,
    });
  }

  const payload: ApiErrorResponse = {
    success: false,
    message:
      isProduction && !normalized.isOperational ? 'Internal server error' : normalized.message,
    code: normalized.code,
    requestId,
  };

  if (normalized.details) {
    payload.errors = normalized.details;
  }

  if (!isProduction && normalized.statusCode >= 500 && err.stack) {
    payload.stack = err.stack;
  }

  res.status(normalized.statusCode).json(payload);
};
