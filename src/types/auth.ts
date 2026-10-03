import type { USER_ROLES, USER_STATUSES } from '../constants/auth';

export type UserRole = (typeof USER_ROLES)[number];

export type UserStatus = (typeof USER_STATUSES)[number];

export type UserDto = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  avatarUrl: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthSessionDto = {
  user: UserDto;
  sessionId: string;
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
};

export type DeviceSessionDto = {
  id: string;
  current: boolean;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
};

export type ClientMeta = {
  ip: string;
  userAgent: string;
};
