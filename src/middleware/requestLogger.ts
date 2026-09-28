import type { NextFunction, Request, Response } from 'express';
import { isProduction } from '../config/env';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  if (isProduction && (req.path === '/' || req.path.startsWith('/api/health'))) {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const statusCode = res.statusCode;
    const meta = {
      method: req.method,
      path: req.path,
      statusCode,
      durationMs: Number(durationMs.toFixed(1)),
    };

    if (statusCode >= 500) {
      req.log.error('HTTP request', meta);
      return;
    }

    if (statusCode >= 400) {
      req.log.warn('HTTP request', meta);
      return;
    }

    req.log.info('HTTP request', meta);
  });

  next();
};
