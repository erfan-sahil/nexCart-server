import { Router } from 'express';
import { Permission } from '../constants/permissions';
import { userController } from '../controllers/user.controller';
import { requirePermissions } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  listUsersQuerySchema,
  updateUserSchema,
  userIdQuerySchema,
} from '../validators/user.validator';

export const userRouter = Router();

const adminUsers = requirePermissions(Permission.adminUsers);

userRouter.get('/', ...adminUsers, validate({ query: listUsersQuerySchema }), userController.list);

userRouter.patch(
  '/',
  ...adminUsers,
  validate({ query: userIdQuerySchema, body: updateUserSchema }),
  userController.update,
);

userRouter.delete(
  '/',
  ...adminUsers,
  validate({ query: userIdQuerySchema }),
  userController.remove,
);
