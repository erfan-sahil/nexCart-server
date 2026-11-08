import type { Request, Response } from 'express';
import { authService } from './auth.service';
import { googleAuthService } from './google-auth.service';
import type { AuthSessionDto, ClientMeta } from './types';
import {
  clearRefreshCookie,
  readRefreshToken,
  setRefreshCookie,
} from '../../common/utils/authCookie';
import { asyncHandler } from '../../common/http/asyncHandler';
import { AppError } from '../../common/errors/AppError';
import { sendCreated, sendSuccess } from '../../common/http/sendResponse';
import { logger } from '../../common/utils/logger';
import type { LoginInput, RegisterInput } from './auth.validator';

const routeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const clientMeta = (req: Request): ClientMeta => ({
  ip: req.ip ?? '',
  userAgent: req.get('user-agent') ?? '',
});

const sendSession = (
  res: Response,
  result: Awaited<ReturnType<typeof authService.login>>,
  message: string,
  created = false,
) => {
  setRefreshCookie(res, result.refreshToken);

  const data: AuthSessionDto = {
    user: result.user,
    sessionId: result.sessionId,
    accessToken: result.accessToken,
    tokenType: 'Bearer',
    expiresIn: result.expiresIn,
  };

  if (created) {
    sendCreated(res, data, message);
    return;
  }

  sendSuccess(res, data, { message });
};

const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body as RegisterInput, clientMeta(req));
  sendSession(res, result, 'Account created', true);
});

const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body as LoginInput, clientMeta(req));
  sendSession(res, result, 'Signed in');
});

const refresh = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = readRefreshToken(req);

  if (!refreshToken) {
    throw AppError.unauthorized('Refresh token is required');
  }

  const result = await authService.refresh(refreshToken, clientMeta(req));
  sendSession(res, result, 'Session refreshed');
});

const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout(readRefreshToken(req));
  clearRefreshCookie(res);
  sendSuccess(res, { loggedOut: true }, { message: 'Signed out' });
});

const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  await authService.logoutAll(req.auth.user.id);
  clearRefreshCookie(res);
  sendSuccess(res, { loggedOut: true }, { message: 'Signed out of all sessions' });
});

const listSessions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  const sessions = await authService.listSessions(req.auth.user.id, req.auth.sessionId);

  sendSuccess(res, sessions, { message: 'Sessions fetched' });
});

const revokeSession = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  const result = await authService.revokeDevice(
    req.auth.user.id,
    routeParam(req.params.sessionId),
    req.auth.sessionId,
  );

  if (result.current) {
    clearRefreshCookie(res);
  }

  sendSuccess(res, result, { message: 'Session revoked' });
});

const me = asyncHandler((req: Request, res: Response) => {
  if (!req.auth) {
    return Promise.reject(AppError.unauthorized());
  }

  sendSuccess(
    res,
    { user: req.auth.user, sessionId: req.auth.sessionId },
    { message: 'Profile fetched' },
  );
  return Promise.resolve();
});

const googleAuth = asyncHandler((req: Request, res: Response) => {
  const authorizationUrl = googleAuthService.getAuthorizationUrl(req.query.callbackUrl);
  res.redirect(authorizationUrl);
  return Promise.resolve();
});

const googleAuthCallback = asyncHandler(async (req: Request, res: Response) => {
  try {
    const { session, callbackUrl } = await googleAuthService.handleCallback(
      {
        code: req.query.code,
        state: req.query.state,
        error: req.query.error,
      },
      clientMeta(req),
    );

    setRefreshCookie(res, session.refreshToken);
    res.redirect(
      googleAuthService.buildSuccessRedirect(callbackUrl, {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        sessionId: session.sessionId,
        expiresIn: session.expiresIn,
      }),
    );
  } catch (error) {
    const appError = error instanceof AppError ? error : null;

    logger.error('Google OAuth callback failed', {
      cause: error instanceof Error ? error.message : 'Unknown error',
      statusCode: appError?.statusCode,
    });

    const message =
      appError?.isOperational && appError.message
        ? appError.message
        : 'Google sign-in failed. Please try again.';

    res.redirect(googleAuthService.buildErrorRedirect(message));
  }
});

export const authController = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  listSessions,
  revokeSession,
  me,
  googleAuth,
  googleAuthCallback,
};
