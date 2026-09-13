import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import type { ApiErrorResponse } from '../types';
import { AppError } from '../utils/AppError';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction,
) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: err.flatten(),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  const statusCode = 500;
  const message = env.NODE_ENV === 'production' ? 'Internal server error' : err.message;

  console.error(err);

  res.status(statusCode).json({
    success: false,
    message,
  });
};
