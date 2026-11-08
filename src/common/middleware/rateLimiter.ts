import { rateLimit, type Options } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { env } from '../../config/env';
import { getRedis, prefixedKey } from '../../config/redis';
import { AppError } from '../errors/AppError';

/**
 * Each limiter needs its own store instance and key prefix so counters never collide.
 * Falls back to express-rate-limit's in-memory store when Redis is disabled.
 */
const redisStore = (name: string): Partial<Pick<Options, 'store'>> => {
  const redis = getRedis();

  if (!redis) {
    return {};
  }

  return {
    store: new RedisStore({
      prefix: prefixedKey(`rl:${name}:`),
      sendCommand: async (command, ...args) => (await redis.call(command, ...args)) as RedisReply,
    }),
  };
};

const baseOptions = {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Fail open: a Redis outage must not turn into 500s for every request.
  passOnStoreError: true,
} satisfies Partial<Options>;

export const authLimiter = rateLimit({
  ...baseOptions,
  ...redisStore('auth'),
  limit: env.AUTH_RATE_LIMIT_MAX,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests('Too many authentication attempts. Try again later.'));
  },
});

export const trackLimiter = rateLimit({
  ...baseOptions,
  ...redisStore('track'),
  limit: env.AUTH_RATE_LIMIT_MAX,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests('Too many tracking attempts. Try again later.'));
  },
});

export const apiLimiter = rateLimit({
  ...baseOptions,
  ...redisStore('api'),
  limit: env.RATE_LIMIT_MAX,
  skip: (req) => req.path === '/' || req.path.startsWith('/api/health'),
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests());
  },
});
