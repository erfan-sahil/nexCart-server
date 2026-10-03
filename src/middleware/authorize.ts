import type { NextFunction, Request, Response } from 'express';
import type { Permission } from '../constants/permissions';
import { roleHasPermission } from '../constants/permissions';
import { AppError } from '../utils/AppError';
import { authenticate } from './authenticate';

export const authorize =
  (...required: [Permission, ...Permission[]]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth;

    if (!auth) {
      next(AppError.unauthorized());
      return;
    }

    const allowed = required.every((permission) => roleHasPermission(auth.user.role, permission));

    if (!allowed) {
      next(AppError.forbidden('You do not have permission to perform this action'));
      return;
    }

    next();
  };

export const requirePermissions = (...required: [Permission, ...Permission[]]) => [
  authenticate,
  authorize(...required),
];
