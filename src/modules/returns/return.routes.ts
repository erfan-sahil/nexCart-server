import { Router } from 'express';
import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { returnController, returnPermissions } from './return.controller';
import { listReturnsQuerySchema, returnIdParamsSchema } from './return.validator';

export const vendorReturnRouter = Router();

vendorReturnRouter.get(
  '/',
  ...requirePermissions(returnPermissions.vendor),
  validate({ query: listReturnsQuerySchema }),
  returnController.listVendor,
);

export const adminReturnRouter = Router();

adminReturnRouter.get(
  '/',
  ...requirePermissions(returnPermissions.admin),
  validate({ query: listReturnsQuerySchema }),
  returnController.listAdmin,
);

adminReturnRouter.post(
  '/:returnId/approve',
  ...requirePermissions(returnPermissions.admin),
  validate({ params: returnIdParamsSchema }),
  returnController.approve,
);

adminReturnRouter.post(
  '/:returnId/refund',
  ...requirePermissions(returnPermissions.admin),
  validate({ params: returnIdParamsSchema }),
  returnController.refund,
);
