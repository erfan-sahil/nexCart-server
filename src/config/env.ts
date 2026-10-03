import 'dotenv/config';
import { z } from 'zod';

const DEV_JWT_ACCESS_SECRET = 'dev-only-access-secret-change-me!!';
const DEV_JWT_REFRESH_SECRET = 'dev-only-refresh-secret-change-me!';

const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

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
        .map((origin) => origin.trim())
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
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/nexcart'),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),
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
