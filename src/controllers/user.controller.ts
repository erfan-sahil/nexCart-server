import type { Request, Response } from 'express';
import { userService } from '../services/user.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/sendResponse';
import type { UpdateUserRoleInput } from '../validators/user.validator';

const routeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const updateRole = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  const body = req.body as UpdateUserRoleInput;
  const user = await userService.updateRole(req.auth.user.id, routeParam(req.params.id), body.role);

  sendSuccess(res, { user }, { message: 'Role updated' });
});

export const userController = {
  updateRole,
};
