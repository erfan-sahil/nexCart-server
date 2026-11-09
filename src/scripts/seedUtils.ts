import bcrypt from 'bcryptjs';

import { env, isProduction } from '../config/env';
import { connectRedis, disconnectRedis } from '../config/redis';
import { CACHE_KEYS } from '../infrastructure/cache/cache-keys';
import { cache } from '../infrastructure/cache/cache.service';
import { UserModel } from '../modules/users/user.model';
import { DEMO_PASSWORD } from './siteSeed';

/** Mock data must never land in a production database by accident. */
export const assertSeedingAllowed = () => {
  if (isProduction) {
    throw new Error('Refusing to seed mock data while NODE_ENV=production');
  }
};

/** Host only, so logs never leak credentials embedded in the connection string. */
export const describeMongoTarget = () => {
  try {
    const url = new URL(env.MONGODB_URI);
    return `${url.host}${url.pathname}`;
  } catch {
    return 'configured MONGODB_URI';
  }
};

let passwordHash: Promise<string> | null = null;

/** Hashing once is enough: every mock account shares the same demo password. */
const demoPasswordHash = () => {
  passwordHash ??= bcrypt.hash(DEMO_PASSWORD, 10);
  return passwordHash;
};

type UserInput = {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: 'customer' | 'vendor' | 'admin';
  avatarUrl?: string;
};

export async function ensureUser(input: UserInput) {
  const email = input.email.toLowerCase();
  const existing = await UserModel.findOne({ email });

  if (existing) {
    return existing;
  }

  return UserModel.create({
    email,
    passwordHash: await demoPasswordHash(),
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    role: input.role,
    status: 'active',
    authProvider: 'local',
    avatarUrl: input.avatarUrl ?? '',
    emailVerifiedAt: new Date(),
  });
}

/** Best effort: drops cached homepage data so new mock content shows without waiting for TTLs. */
export async function flushPublicCaches() {
  await connectRedis();
  await cache.invalidate(
    CACHE_KEYS.hero,
    CACHE_KEYS.siteSettings,
    CACHE_KEYS.flashDealMeta,
    CACHE_KEYS.catalogHome,
  );
  await cache.invalidateByPrefix(CACHE_KEYS.categoriesPrefix);
  await disconnectRedis();
}
