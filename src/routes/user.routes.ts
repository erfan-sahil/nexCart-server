import { Router } from 'express';
import { Permission } from '../constants/permissions';
import { userController } from '../controllers/user.controller';
import { requirePermissions } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { updateUserRoleSchema, userIdParamsSchema } from '../validators/user.validator';

export const userRouter = Router();

userRouter.patch(
  '/:id/role',
  ...requirePermissions(Permission.userManage),
  validate({ params: userIdParamsSchema, body: updateUserRoleSchema }),
  userController.updateRole,
);
