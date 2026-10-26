import { Router } from 'express';
import { Permission } from '../constants/permissions';
import { userController } from '../controllers/user.controller';
import { requirePermissions } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  accountStatusSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdQuerySchema,
} from '../validators/user.validator';

export const userRouter = Router();

const adminUsers = requirePermissions(Permission.adminUsers);

userRouter.get(
  '/',
  ...adminUsers,
  validate({ query: listUsersQuerySchema }),
  userController.listUsers,
);

userRouter.patch(
  '/',
  ...adminUsers,
  validate({ query: userIdQuerySchema, body: updateUserSchema }),
  userController.updateUser,
);

userRouter.patch(
  '/status',
  ...adminUsers,
  validate({ query: userIdQuerySchema, body: accountStatusSchema }),
  userController.setAccountStatus,
);

userRouter.patch(
  '/buyers/status',
  ...adminUsers,
  validate({ query: userIdQuerySchema, body: accountStatusSchema }),
  userController.setBuyerStatus,
);

userRouter.patch(
  '/vendors/status',
  ...adminUsers,
  validate({ query: userIdQuerySchema, body: accountStatusSchema }),
  userController.setVendorStatus,
);

userRouter.delete(
  '/',
  ...adminUsers,
  validate({ query: userIdQuerySchema }),
  userController.deleteUser,
);
