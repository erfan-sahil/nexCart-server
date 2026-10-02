import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

const ISSUER = 'nexcart';
const AUDIENCE = 'nexcart-api';

export type AccessTokenClaims = {
  sub: string;
  sid: string;
  type: 'access';
  iat: number;
};

export type RefreshTokenClaims = {
  sub: string;
  jti: string;
  sid: string;
  type: 'refresh';
  iat: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const verify = (token: string, secret: string, expiredMessage: string) => {
  try {
    return jwt.verify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized(expiredMessage);
    }

    throw AppError.unauthorized('Invalid token');
  }
};

export const signAccessToken = (userId: string, sessionId: string) =>
  jwt.sign({ sub: userId, sid: sessionId, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    issuer: ISSUER,
    audience: AUDIENCE,
  });

export const signRefreshToken = (input: { sub: string; jti: string; sid: string }) =>
  jwt.sign(
    {
      sub: input.sub,
      jti: input.jti,
      sid: input.sid,
      type: 'refresh',
    },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: env.JWT_REFRESH_TTL_SECONDS,
      issuer: ISSUER,
      audience: AUDIENCE,
    },
  );

export const verifyAccessToken = (token: string): AccessTokenClaims => {
  const decoded = verify(token, env.JWT_ACCESS_SECRET, 'Access token expired');

  if (
    !isRecord(decoded) ||
    decoded.type !== 'access' ||
    typeof decoded.sub !== 'string' ||
    typeof decoded.sid !== 'string' ||
    typeof decoded.iat !== 'number'
  ) {
    throw AppError.unauthorized('Invalid token');
  }

  return {
    sub: decoded.sub,
    sid: decoded.sid,
    type: 'access',
    iat: decoded.iat,
  };
};

export const verifyRefreshToken = (token: string): RefreshTokenClaims => {
  const decoded = verify(token, env.JWT_REFRESH_SECRET, 'Refresh token expired');

  if (
    !isRecord(decoded) ||
    decoded.type !== 'refresh' ||
    typeof decoded.sub !== 'string' ||
    typeof decoded.jti !== 'string' ||
    typeof decoded.sid !== 'string' ||
    typeof decoded.iat !== 'number'
  ) {
    throw AppError.unauthorized('Invalid token');
  }

  return {
    sub: decoded.sub,
    jti: decoded.jti,
    sid: decoded.sid,
    type: 'refresh',
    iat: decoded.iat,
  };
};

export const passwordChangedAfter = (
  passwordChangedAt: Date | null | undefined,
  issuedAt: number,
) => {
  if (!passwordChangedAt) {
    return false;
  }

  return Math.floor(passwordChangedAt.getTime() / 1000) > issuedAt;
};
