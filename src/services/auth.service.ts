import { randomUUID } from 'node:crypto';
import {
  ACCOUNT_LOCK_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  USER_ROLES,
  USER_STATUSES,
} from '../constants/auth';
import { env } from '../config/env';
import { AuthSessionModel, type AuthSession } from '../models/authSession.model';
import { UserModel, type User } from '../models/user.model';
import type { ClientMeta, DeviceSessionDto, UserDto, UserRole, UserStatus } from '../types/auth';
import { AppError } from '../utils/AppError';
import { duplicateKeyFields } from '../utils/mongoError';
import { hashPassword, verifyPassword } from '../utils/password';
import type { LoginInput, RegisterInput } from '../validators/auth.validator';
import {
  passwordChangedAfter,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from './token.service';

type AuthResult = {
  user: UserDto;
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type PublicUser = {
  _id: User['_id'];
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: string;
  status: string;
  emailVerifiedAt?: Date | null;
  avatarUrl: string;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const toRole = (role: string): UserRole => {
  const match = USER_ROLES.find((item) => item === role);

  if (!match) {
    throw AppError.internal('Stored user role is invalid');
  }

  return match;
};

const toStatus = (status: string): UserStatus => {
  const match = USER_STATUSES.find((item) => item === status);

  if (!match) {
    throw AppError.internal('Stored user status is invalid');
  }

  return match;
};

export const toUserDto = (user: PublicUser): UserDto => ({
  id: String(user._id),
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone ?? null,
  role: toRole(user.role),
  status: toStatus(user.status),
  emailVerified: Boolean(user.emailVerifiedAt),
  avatarUrl: user.avatarUrl,
  lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});

const clientMeta = (meta: ClientMeta): ClientMeta => ({
  ip: meta.ip.slice(0, 64),
  userAgent: meta.userAgent.slice(0, 512),
});

const revokeSession = (sessionId: string) =>
  AuthSessionModel.updateOne({ sessionId, revokedAt: null }, { $set: { revokedAt: new Date() } });

const tokenPair = (user: PublicUser, sessionId: string, jti: string): AuthResult => ({
  user: toUserDto(user),
  sessionId,
  accessToken: signAccessToken(String(user._id), sessionId),
  refreshToken: signRefreshToken({
    sub: String(user._id),
    jti,
    sid: sessionId,
  }),
  expiresIn: env.JWT_ACCESS_TTL_SECONDS,
});

const createSession = async (user: PublicUser, meta: ClientMeta): Promise<AuthResult> => {
  const sessionId = randomUUID();
  const jti = randomUUID();
  const now = new Date();
  const safeMeta = clientMeta(meta);

  await AuthSessionModel.create({
    sessionId,
    userId: user._id,
    currentJti: jti,
    expiresAt: new Date(now.getTime() + env.JWT_REFRESH_TTL_SECONDS * 1000),
    startedAt: now,
    lastUsedAt: now,
    userAgent: safeMeta.userAgent,
    ip: safeMeta.ip,
  });

  return tokenPair(user, sessionId, jti);
};

const rotateSession = async (
  session: AuthSession,
  user: PublicUser,
  meta: ClientMeta,
): Promise<AuthResult> => {
  const jti = randomUUID();
  const now = new Date();
  const safeMeta = clientMeta(meta);
  const rotated = await AuthSessionModel.findOneAndUpdate(
    {
      sessionId: session.sessionId,
      currentJti: session.currentJti,
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        currentJti: jti,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + env.JWT_REFRESH_TTL_SECONDS * 1000),
        userAgent: safeMeta.userAgent,
        ip: safeMeta.ip,
      },
    },
  );

  if (!rotated) {
    await revokeSession(session.sessionId);
    throw AppError.unauthorized('Session is no longer valid. Please sign in again.');
  }

  return tokenPair(user, session.sessionId, jti);
};

const toDeviceSession = (session: AuthSession, currentSessionId: string): DeviceSessionDto => ({
  id: session.sessionId,
  current: session.sessionId === currentSessionId,
  userAgent: session.userAgent,
  ip: session.ip,
  createdAt: session.startedAt.toISOString(),
  lastUsedAt: session.lastUsedAt.toISOString(),
  expiresAt: session.expiresAt.toISOString(),
});

const requireActiveUser = (user: User | null) => {
  if (!user || user.status !== 'active') {
    throw AppError.unauthorized('Session is no longer valid. Please sign in again.');
  }

  return user;
};

const registerConflict = (error: unknown): Error => {
  const fields = duplicateKeyFields(error);

  if (fields.includes('email')) {
    return AppError.conflict('An account with this email already exists');
  }

  if (fields.includes('phone')) {
    return AppError.conflict('An account with this phone number already exists');
  }

  if (error instanceof Error) {
    return error;
  }

  return AppError.internal();
};

export const authService = {
  async register(input: RegisterInput, meta: ClientMeta) {
    const passwordHash = await hashPassword(input.password);

    try {
      const user = await UserModel.create({
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        ...(input.phone ? { phone: input.phone } : {}),
        role: 'customer',
      });

      return await createSession(user, meta);
    } catch (error) {
      throw registerConflict(error);
    }
  },

  async login(input: LoginInput, meta: ClientMeta) {
    const user = await UserModel.findOne({ email: input.email }).select(
      '+passwordHash +failedLoginAttempts +lockUntil',
    );

    if (!user) {
      await verifyPassword(input.password);
      throw AppError.unauthorized('Invalid email or password');
    }

    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      throw AppError.tooManyRequests('Too many failed sign-in attempts. Try again later.');
    }

    if (user.lockUntil && user.lockUntil.getTime() <= Date.now()) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
    }

    const passwordMatches = await verifyPassword(input.password, user.passwordHash);

    if (!passwordMatches) {
      user.failedLoginAttempts += 1;

      if (user.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + ACCOUNT_LOCK_MS);
      }

      await user.save();
      throw AppError.unauthorized('Invalid email or password');
    }

    if (user.status === 'suspended') {
      throw AppError.forbidden('This account is suspended');
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    return createSession(user, meta);
  },

  async refresh(refreshToken: string, meta: ClientMeta) {
    const claims = verifyRefreshToken(refreshToken);
    const session = await AuthSessionModel.findOne({ sessionId: claims.sid });

    if (!session || String(session.userId) !== claims.sub) {
      throw AppError.unauthorized('Session is no longer valid. Please sign in again.');
    }

    if (session.revokedAt || session.currentJti !== claims.jti) {
      if (!session.revokedAt) {
        await revokeSession(session.sessionId);
      }

      throw AppError.unauthorized('Session is no longer valid. Please sign in again.');
    }

    const user = requireActiveUser(await UserModel.findById(session.userId));

    if (passwordChangedAfter(user.passwordChangedAt, claims.iat)) {
      await AuthSessionModel.updateMany(
        { userId: user._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
      throw AppError.unauthorized('Password was changed. Please sign in again.');
    }

    return rotateSession(session, user, meta);
  },

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) {
      return;
    }

    try {
      const claims = verifyRefreshToken(refreshToken);
      await AuthSessionModel.updateOne(
        { sessionId: claims.sid, userId: claims.sub, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 401) {
        return;
      }

      throw error;
    }
  },

  async logoutAll(userId: string) {
    await AuthSessionModel.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  },

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await AuthSessionModel.find({
      userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).sort({ lastUsedAt: -1 });

    return sessions.map((session) => toDeviceSession(session, currentSessionId));
  },

  async revokeDevice(userId: string, sessionId: string, currentSessionId: string) {
    const session = await AuthSessionModel.findOneAndUpdate(
      { userId, sessionId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );

    if (!session) {
      throw AppError.notFound('Session not found');
    }

    return {
      id: sessionId,
      current: sessionId === currentSessionId,
    };
  },

  async resolveAccessToken(token: string) {
    const claims = verifyAccessToken(token);
    const user = requireActiveUser(await UserModel.findById(claims.sub));

    if (passwordChangedAfter(user.passwordChangedAt, claims.iat)) {
      throw AppError.unauthorized('Password was changed. Please sign in again.');
    }

    const session = await AuthSessionModel.exists({
      sessionId: claims.sid,
      userId: user._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      throw AppError.unauthorized('Session is no longer valid. Please sign in again.');
    }

    return {
      user: toUserDto(user),
      sessionId: claims.sid,
    };
  },
};
