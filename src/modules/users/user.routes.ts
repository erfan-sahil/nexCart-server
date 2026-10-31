import { Router } from 'express';
import { Permission } from '../../common/constants/permissions';
import { userController } from './user.controller';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import {
  accountStatusSchema,
  listUsersQuerySchema,
  updateMeSchema,
  updateUserSchema,
  userIdQuerySchema,
} from './user.validator';

export const userRouter = Router();

const adminUsers = requirePermissions(Permission.adminUsers);

userRouter.patch('/me', authenticate, validate({ body: updateMeSchema }), userController.updateMe);

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
