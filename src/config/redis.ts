import { Redis } from 'ioredis';
import { env } from './env';
import { logger } from '../common/utils/logger';

const CONNECT_TIMEOUT_MS = 5_000;
const COMMAND_TIMEOUT_MS = 1_000;
const HEALTH_TIMEOUT_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 5_000;

export const redisKeyPrefix = env.REDIS_KEY_PREFIX || `nexcart:${env.NODE_ENV}:`;

export const prefixedKey = (key: string) => `${redisKeyPrefix}${key}`;

export type RedisHealth = 'up' | 'down' | 'disabled';

let client: Redis | null = null;

const createClient = () => {
  // lazyConnect: connectRedis() owns the first connect attempt.
  // enableOfflineQueue: false so a Redis outage fails commands immediately instead of hanging requests.
  const instance = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    commandTimeout: COMMAND_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (attempt) => Math.min(attempt * 200, MAX_RECONNECT_DELAY_MS),
  });

  instance.on('error', (error: unknown) => {
    logger.error('Redis connection error', { err: error });
  });
  instance.on('reconnecting', () => {
    logger.warn('Redis reconnecting');
  });
  instance.on('ready', () => {
    logger.info('Redis ready');
  });

  return instance;
};

/** Returns the shared client, or null when Redis is disabled. */
export const getRedis = (): Redis | null => {
  if (!env.REDIS_ENABLED) {
    return null;
  }

  client ??= createClient();
  return client;
};

/**
 * Waits for the first connection. Throws only when REDIS_REQUIRED is set;
 * otherwise the API starts degraded and the client keeps reconnecting.
 */
export const connectRedis = async () => {
  const redis = getRedis();

  if (!redis) {
    logger.info('Redis disabled');
    return;
  }

  if (redis.status === 'ready') {
    return;
  }

  try {
    // lazyConnect starts in "wait"; after a failed reconnect it may be "end"/"close".
    await redis.connect();
  } catch (error) {
    if (env.REDIS_REQUIRED) {
      throw error;
    }

    logger.warn('Redis unavailable at startup; continuing without cache and shared rate limits', {
      err: error,
    });
  }
};

export const disconnectRedis = async () => {
  if (!client) {
    return;
  }

  const redis = client;
  client = null;

  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }

  logger.info('Redis disconnected');
};

export const redisHealth = async (): Promise<RedisHealth> => {
  const redis = getRedis();

  if (!redis) {
    return 'disabled';
  }

  if (redis.status !== 'ready') {
    return 'down';
  }

  try {
    await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Redis ping timed out'));
        }, HEALTH_TIMEOUT_MS).unref();
      }),
    ]);
    return 'up';
  } catch {
    return 'down';
  }
};
