import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

export const requestTimeout = (req: Request, res: Response, next: NextFunction) => {
  const timer = setTimeout(() => {
    if (!res.headersSent && !res.writableEnded) {
      next(AppError.requestTimeout());
    }
  }, env.REQUEST_TIMEOUT_MS);

  const clear = () => clearTimeout(timer);

  res.on('finish', clear);
  res.on('close', clear);
  next();
};
