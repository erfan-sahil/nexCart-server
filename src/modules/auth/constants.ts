export const USER_ROLES = ['customer', 'vendor', 'admin'] as const;

export const USER_STATUSES = ['active', 'suspended'] as const;

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

export const ACCOUNT_LOCK_MS = 15 * 60 * 1000;
