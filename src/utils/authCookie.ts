import type { CookieOptions, Request, Response } from 'express';
import { env, isProduction } from '../config/env';

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProduction || env.AUTH_COOKIE_SAMESITE === 'none',
  sameSite: env.AUTH_COOKIE_SAMESITE,
  path: '/api/auth',
});

export const readRefreshToken = (req: Request) => {
  const header = req.headers.cookie;

  if (!header) {
    return undefined;
  }

  const prefix = `${env.AUTH_COOKIE_NAME}=`;
  const pair = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!pair) {
    return undefined;
  }

  const raw = pair.slice(prefix.length);

  if (!raw) {
    return undefined;
  }

  try {
    const value = decodeURIComponent(raw);
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
};

export const setRefreshCookie = (res: Response, token: string) => {
  res.cookie(env.AUTH_COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: env.JWT_REFRESH_TTL_SECONDS * 1000,
  });
};

export const clearRefreshCookie = (res: Response) => {
  res.clearCookie(env.AUTH_COOKIE_NAME, cookieOptions());
};
