import { getRedis, prefixedKey } from '../../config/redis';
import { logger } from '../../common/utils/logger';

const SCAN_BATCH_SIZE = 100;

/** Concurrent misses for the same key on this instance share one loader call. */
const inFlight = new Map<string, Promise<unknown>>();

const readCached = async <T>(key: string): Promise<{ hit: true; value: T } | { hit: false }> => {
  const redis = getRedis();

  if (!redis || redis.status !== 'ready') {
    return { hit: false };
  }

  try {
    const raw = await redis.get(prefixedKey(key));

    if (raw === null) {
      return { hit: false };
    }

    return { hit: true, value: JSON.parse(raw) as T };
  } catch (error) {
    logger.warn('Cache read failed', { key, err: error });
    return { hit: false };
  }
};

const writeCached = async (key: string, value: unknown, ttlSeconds: number) => {
  const redis = getRedis();

  if (!redis || redis.status !== 'ready' || value === undefined) {
    return;
  }

  try {
    await redis.set(prefixedKey(key), JSON.stringify(value), 'EX', ttlSeconds);
  } catch (error) {
    logger.warn('Cache write failed', { key, err: error });
  }
};

/**
 * Read-through cache. Redis problems never fail the request: on any error the loader result is
 * returned directly. Values round-trip through JSON, so only cache JSON-safe, non-personalized data.
 */
const getOrSet = async <T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> => {
  const cached = await readCached<T>(key);

  if (cached.hit) {
    return cached.value;
  }

  const pending = inFlight.get(key) as Promise<T> | undefined;

  if (pending) {
    return pending;
  }

  const load = (async () => {
    const value = await loader();
    await writeCached(key, value, ttlSeconds);
    return value;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, load);
  return load;
};

const invalidate = async (...keys: string[]) => {
  const redis = getRedis();

  if (!redis || keys.length === 0) {
    return;
  }

  try {
    await redis.unlink(...keys.map(prefixedKey));
  } catch (error) {
    logger.warn('Cache invalidation failed', { keys, err: error });
  }
};

/** Deletes every key that starts with `prefix`, using SCAN so Redis is never blocked. */
const invalidateByPrefix = async (prefix: string) => {
  const redis = getRedis();

  if (!redis) {
    return;
  }

  try {
    let cursor = '0';

    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        `${prefixedKey(prefix)}*`,
        'COUNT',
        SCAN_BATCH_SIZE,
      );

      cursor = next;

      if (keys.length > 0) {
        await redis.unlink(...keys);
      }
    } while (cursor !== '0');
  } catch (error) {
    logger.warn('Cache prefix invalidation failed', { prefix, err: error });
  }
};

export const cache = {
  getOrSet,
  invalidate,
  invalidateByPrefix,
};
