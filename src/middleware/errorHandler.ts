import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../config/env';
import type { ApiErrorResponse, FieldError } from '../types';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

type BodyParserError = Error & {
  status?: number;
  statusCode?: number;
  type?: string;
};

const isBodyParserError = (err: unknown): err is BodyParserError => {
  return err instanceof Error && ('type' in err || 'status' in err || 'statusCode' in err);
};

const zodFieldErrors = (error: ZodError): FieldError[] =>
  error.issues.map((issue) => ({
    path: issue.path.join('.') || 'root',
    message: issue.message,
  }));

const normalizeError = (err: unknown): AppError => {
  if (err instanceof AppError) {
    return err;
  }

  if (err instanceof ZodError) {
    return AppError.validation('Validation failed', zodFieldErrors(err));
  }

  if (err instanceof URIError) {
    return AppError.badRequest('Malformed URL');
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

  if (isBodyParserError(err) && (err.status === 400 || err.statusCode === 400)) {
    return AppError.badRequest('Bad request');
  }

  if (err instanceof Error) {
    return AppError.internal(isProduction ? 'Internal server error' : err.message);
  }

  return AppError.internal();
};

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response<ApiErrorResponse>,
  next: NextFunction,
) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const normalized = normalizeError(err);
  const requestId = req.requestId || 'unknown';
  const log = req.log ?? logger;
  const logMeta = {
    requestId,
    method: req.method,
    path: req.path,
    statusCode: normalized.statusCode,
    code: normalized.code,
  };

  if (!normalized.isOperational || normalized.statusCode >= 500) {
    log.error(normalized.message, { ...logMeta, err });
  } else {
    log.warn(normalized.message, logMeta);
  }

  const payload: ApiErrorResponse = {
    success: false,
    message:
      isProduction && !normalized.isOperational ? 'Internal server error' : normalized.message,
    code: normalized.code,
    requestId,
  };

  if (normalized.details && normalized.details.length > 0) {
    payload.errors = normalized.details;
  }

  if (!isProduction && normalized.statusCode >= 500 && err instanceof Error && err.stack) {
    payload.stack = err.stack;
  }

  res.status(normalized.statusCode).json(payload);
};
