import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) => req.path === '/' || req.path.startsWith('/api/health'),
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests());
  },
});
