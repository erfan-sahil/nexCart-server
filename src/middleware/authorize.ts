import type { NextFunction, Request, Response } from 'express';
import type { Permission } from '../constants/permissions';
import { roleHasPermission } from '../constants/permissions';
import { AppError } from '../utils/AppError';
import { authenticate } from './authenticate';

type Middleware = (req: Request, res: Response, next: NextFunction) => void;
type PermissionList = [Permission, ...Permission[]];

const forbiddenMessage = 'You do not have permission to perform this action';

function checkPermissions(required: PermissionList, mode: 'every' | 'some'): Middleware {
  return (req, _res, next) => {
    const auth = req.auth;

    if (!auth) {
      next(AppError.unauthorized());
      return;
    }

    const allowed =
      mode === 'every'
        ? required.every((permission) => roleHasPermission(auth.user.role, permission))
        : required.some((permission) => roleHasPermission(auth.user.role, permission));

    if (!allowed) {
      next(AppError.forbidden(forbiddenMessage));
      return;
    }

    next();
  };
}

export function authorize(...required: PermissionList): Middleware {
  return checkPermissions(required, 'every');
}

export function authorizeAny(...required: PermissionList): Middleware {
  return checkPermissions(required, 'some');
}

export function requirePermissions(...required: PermissionList): readonly [Middleware, Middleware] {
  return [authenticate, authorize(...required)];
}

export function requireAnyPermissions(
  ...required: PermissionList
): readonly [Middleware, Middleware] {
  return [authenticate, authorizeAny(...required)];
}
