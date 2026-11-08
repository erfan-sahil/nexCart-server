import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env';
import { AppError } from '../../common/errors/AppError';
import { logger } from '../../common/utils/logger';
import { UserModel } from '../users/user.model';
import { authService } from './auth.service';
import type { ClientMeta } from './types';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const OAUTH_STATE_EXPIRES_IN = '10m';

type GoogleProfile = {
  sub: string;
  email: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

const assertGoogleConfigured = () => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw AppError.serviceUnavailable('Google sign-in is not configured');
  }
};

const sanitizeCallbackUrl = (callbackUrl: unknown) => {
  if (
    typeof callbackUrl !== 'string' ||
    !callbackUrl.startsWith('/') ||
    callbackUrl.startsWith('//') ||
    callbackUrl.includes('\\') ||
    callbackUrl.includes('://')
  ) {
    return '/';
  }

  return callbackUrl;
};

const buildClientRedirectUrl = (pathname: string, params: Record<string, string> = {}) => {
  const url = new URL(pathname, env.CLIENT_APP_URL);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
};

const createOAuthState = (callbackUrl: unknown) =>
  jwt.sign(
    {
      callbackUrl: sanitizeCallbackUrl(callbackUrl),
      nonce: randomBytes(16).toString('hex'),
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: OAUTH_STATE_EXPIRES_IN },
  );

const parseOAuthState = (state: unknown) => {
  if (typeof state !== 'string' || !state) {
    throw AppError.badRequest('Invalid Google sign-in state');
  }

  try {
    const payload = jwt.verify(state, env.JWT_ACCESS_SECRET);

    if (typeof payload !== 'object' || payload === null) {
      throw AppError.badRequest('Invalid Google sign-in state');
    }

    return {
      callbackUrl: sanitizeCallbackUrl('callbackUrl' in payload ? payload.callbackUrl : undefined),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw AppError.badRequest('Google sign-in session expired. Please try again.');
  }
};

const exchangeCodeForTokens = async (code: string) => {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      grant_type: 'authorization_code',
    }),
  });

  const data = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !data.access_token) {
    logger.error('Google token exchange failed', {
      status: response.status,
      error: data.error,
      description: data.error_description,
    });
    throw AppError.unauthorized('Google authentication failed');
  }

  return data;
};

const fetchGoogleProfile = async (accessToken: string) => {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const profile = (await response.json()) as GoogleProfile & {
    error?: string;
  };

  if (!response.ok || !profile.sub || !profile.email) {
    logger.error('Google userinfo fetch failed', {
      status: response.status,
      error: profile.error,
    });
    throw AppError.unauthorized('Unable to load Google account details');
  }

  if (profile.email_verified === false) {
    throw AppError.forbidden('Google email is not verified');
  }

  return profile;
};

const splitDisplayName = (profile: GoogleProfile) => {
  const givenName = profile.given_name?.trim();
  const familyName = profile.family_name?.trim();

  if (givenName || familyName) {
    return {
      firstName: givenName || familyName || 'Google',
      lastName: familyName || (givenName ? 'User' : 'User'),
    };
  }

  const fullName = profile.name?.trim();

  if (fullName) {
    const [firstName, ...rest] = fullName.split(/\s+/);
    return {
      firstName: firstName || 'Google',
      lastName: rest.join(' ') || 'User',
    };
  }

  const localPart = profile.email.split('@')[0] || 'user';

  return {
    firstName: localPart,
    lastName: 'User',
  };
};

const upsertGoogleUser = async (profile: GoogleProfile, meta: ClientMeta) => {
  const googleId = profile.sub;
  const email = profile.email.toLowerCase().trim();
  const { firstName, lastName } = splitDisplayName(profile);
  const avatarUrl = profile.picture?.trim() || '';

  let user = await UserModel.findOne({ googleId }).select('+googleId +passwordHash');

  if (!user) {
    user = await UserModel.findOne({ email }).select('+googleId +passwordHash');
  }

  if (user) {
    if (user.status === 'suspended') {
      throw AppError.forbidden('This account is suspended');
    }

    if (user.googleId && user.googleId !== googleId) {
      throw AppError.conflict('This email is already linked to a different Google account');
    }

    user.googleId = googleId;
    user.emailVerifiedAt = user.emailVerifiedAt ?? new Date();

    if (!user.avatarUrl && avatarUrl) {
      user.avatarUrl = avatarUrl;
    }

    if (user.authProvider === 'local' && !user.passwordHash) {
      user.authProvider = 'google';
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    return authService.createSessionForUser(user, meta);
  }

  const created = await UserModel.create({
    firstName,
    lastName,
    email,
    passwordHash: null,
    googleId,
    authProvider: 'google',
    avatarUrl,
    role: 'customer',
    emailVerifiedAt: new Date(),
    lastLoginAt: new Date(),
  });

  return authService.createSessionForUser(created, meta);
};

export const googleAuthService = {
  getAuthorizationUrl(callbackUrl: unknown) {
    assertGoogleConfigured();

    const state = createOAuthState(callbackUrl);
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
      access_type: 'online',
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  },

  async handleCallback(
    input: {
      code?: unknown;
      state?: unknown;
      error?: unknown;
    },
    meta: ClientMeta,
  ) {
    if (typeof input.error === 'string' && input.error) {
      throw AppError.unauthorized(
        input.error === 'access_denied' ? 'Google sign-in was cancelled' : 'Google sign-in failed',
      );
    }

    if (typeof input.code !== 'string' || !input.code) {
      throw AppError.badRequest('Google authorization code is missing');
    }

    assertGoogleConfigured();

    const { callbackUrl } = parseOAuthState(input.state);
    const tokenResponse = await exchangeCodeForTokens(input.code);
    const profile = await fetchGoogleProfile(tokenResponse.access_token!);
    const session = await upsertGoogleUser(profile, meta);

    return { session, callbackUrl };
  },

  buildSuccessRedirect(
    callbackUrl: string,
    tokens: {
      accessToken: string;
      refreshToken: string;
      sessionId: string;
      expiresIn: number;
    },
  ) {
    const url = new URL(buildClientRedirectUrl(sanitizeCallbackUrl(callbackUrl)));

    // Hash keeps tokens out of server logs / Referer while letting the SPA
    // persist Bearer auth when cross-site cookies are blocked.
    url.hash = new URLSearchParams({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      sessionId: tokens.sessionId,
      expiresIn: String(tokens.expiresIn),
    }).toString();

    return url.toString();
  },

  buildErrorRedirect(message: string) {
    return buildClientRedirectUrl('/login', {
      error: 'google_auth',
      message,
    });
  },
};
