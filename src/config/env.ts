import 'dotenv/config';
import { z } from 'zod';

const DEV_JWT_ACCESS_SECRET = 'dev-only-access-secret-change-me!!';
const DEV_JWT_REFRESH_SECRET = 'dev-only-refresh-secret-change-me!';

const booleanWithDefault = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(defaultValue)
    .transform((value) => value === 'true' || value === '1');

const booleanFromString = booleanWithDefault('false');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).optional(),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter(Boolean),
    ),
  BODY_LIMIT: z.string().default('10kb'),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  TRUST_PROXY: booleanFromString,
  MONGODB_URI: z
    .string()
    .min(1)
    .default('mongodb://127.0.0.1:27017/nexcart?replicaSet=rs0&directConnection=true'),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),
  REDIS_ENABLED: booleanWithDefault('true'),
  REDIS_REQUIRED: booleanFromString,
  REDIS_KEY_PREFIX: z.string().trim().optional(),
  CACHE_DEFAULT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  JWT_ACCESS_SECRET: z.string().min(32).default(DEV_JWT_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z.string().min(32).default(DEV_JWT_REFRESH_SECRET),
  JWT_ACCESS_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  JWT_REFRESH_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 60 * 60),
  AUTH_COOKIE_NAME: z.string().trim().min(1).default('refreshToken'),
  AUTH_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  UPLOAD_DIR: z.string().trim().min(1).default('uploads'),
  IMAGE_STORAGE_DRIVER: z.enum(['local', 'cloudinary']).default('local'),
  CLOUDINARY_CLOUD_NAME: z.string().trim().default(''),
  CLOUDINARY_API_KEY: z.string().trim().default(''),
  CLOUDINARY_API_SECRET: z.string().trim().default(''),
  CLOUDINARY_FOLDER: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, numbers, dashes, or underscores')
    .default('nexcart'),
  ORDER_DELIVERY_FEE: z.coerce.number().min(0).default(100),
  ORDER_PAYMENT_HOLD_MINUTES: z.coerce.number().int().positive().default(30),
  ORDER_CURRENCY: z.string().trim().length(3).default('BDT'),
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  CLIENT_APP_URL: z.string().url().default('http://localhost:3000'),
  GOOGLE_CLIENT_ID: z.string().trim().default(''),
  GOOGLE_CLIENT_SECRET: z.string().trim().default(''),
  GOOGLE_CALLBACK_URL: z.string().url().default('http://localhost:4000/api/auth/google/callback'),
  SSLCOMMERZ_MOCK: z
    .enum(['true', 'false', '1', '0'])
    .default('true')
    .transform((value) => value === 'true' || value === '1'),
  SSLCOMMERZ_IS_SANDBOX: z
    .enum(['true', 'false', '1', '0'])
    .default('true')
    .transform((value) => value === 'true' || value === '1'),
  SSLCOMMERZ_STORE_ID: z.string().trim().default(''),
  SSLCOMMERZ_STORE_PASSWORD: z.string().trim().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('\n');

  throw new Error(`Invalid environment variables:\n${details}`);
}

export type Env = z.infer<typeof envSchema>;
export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';

if (
  isProduction &&
  (env.JWT_ACCESS_SECRET === DEV_JWT_ACCESS_SECRET ||
    env.JWT_REFRESH_SECRET === DEV_JWT_REFRESH_SECRET ||
    env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET)
) {
  throw new Error(
    'Set distinct JWT_ACCESS_SECRET and JWT_REFRESH_SECRET values before running in production',
  );
}

if (
  env.IMAGE_STORAGE_DRIVER === 'cloudinary' &&
  (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET)
) {
  throw new Error(
    'Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET when IMAGE_STORAGE_DRIVER=cloudinary',
  );
}

if (env.REDIS_REQUIRED && !env.REDIS_ENABLED) {
  throw new Error('Set REDIS_ENABLED=true when REDIS_REQUIRED=true');
}

if (isProduction && env.SSLCOMMERZ_MOCK) {
  throw new Error('Disable SSLCOMMERZ_MOCK before running in production');
}

if (
  !env.SSLCOMMERZ_MOCK &&
  (!env.SSLCOMMERZ_STORE_ID || !env.SSLCOMMERZ_STORE_PASSWORD) &&
  isProduction
) {
  throw new Error(
    'Set SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD before running in production',
  );
}
