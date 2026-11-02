import { Router } from 'express';
import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { withdrawalController, withdrawalPermissions } from './withdrawal.controller';
import {
  createWithdrawalSchema,
  listWithdrawalsQuerySchema,
  reviewWithdrawalSchema,
  withdrawalIdParamsSchema,
} from './withdrawal.validator';

export const vendorWithdrawalRouter = Router();

vendorWithdrawalRouter.get(
  '/',
  ...requirePermissions(withdrawalPermissions.vendor),
  validate({ query: listWithdrawalsQuerySchema }),
  withdrawalController.listMine,
);

vendorWithdrawalRouter.post(
  '/',
  ...requirePermissions(withdrawalPermissions.vendor),
  validate({ body: createWithdrawalSchema }),
  withdrawalController.create,
);

vendorWithdrawalRouter.post(
  '/:withdrawalId/cancel',
  ...requirePermissions(withdrawalPermissions.vendor),
  validate({ params: withdrawalIdParamsSchema }),
  withdrawalController.cancel,
);

export const adminWithdrawalRouter = Router();

adminWithdrawalRouter.get(
  '/',
  ...requirePermissions(withdrawalPermissions.admin),
  validate({ query: listWithdrawalsQuerySchema }),
  withdrawalController.listAdmin,
);

adminWithdrawalRouter.post(
  '/:withdrawalId/review',
  ...requirePermissions(withdrawalPermissions.admin),
  validate({ params: withdrawalIdParamsSchema, body: reviewWithdrawalSchema }),
  withdrawalController.review,
);
