import { Router } from 'express';
import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { returnController, returnPermissions } from './return.controller';
import {
  inspectReturnBodySchema,
  listReturnsQuerySchema,
  resolveReturnBodySchema,
  returnIdParamsSchema,
} from './return.validator';

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

adminReturnRouter.get(
  '/refund-transactions',
  ...requirePermissions(returnPermissions.admin),
  validate({ query: listReturnsQuerySchema }),
  returnController.listRefundTransactions,
);

adminReturnRouter.get(
  '/:returnId',
  ...requirePermissions(returnPermissions.admin),
  validate({ params: returnIdParamsSchema }),
  returnController.getAdmin,
);

adminReturnRouter.get(
  '/:returnId/refund-preview',
  ...requirePermissions(returnPermissions.admin),
  validate({ params: returnIdParamsSchema }),
  returnController.previewRefund,
);

adminReturnRouter.post(
  '/:returnId/returning',
  ...requirePermissions(returnPermissions.admin),
  validate({ params: returnIdParamsSchema }),
  returnController.markReturning,
);

adminReturnRouter.post(
  '/:returnId/receive',
  ...requirePermissions(returnPermissions.admin),
  validate({ params: returnIdParamsSchema }),
  returnController.markReceived,
);

adminReturnRouter.post(
  '/:returnId/inspect',
  ...requirePermissions(returnPermissions.admin),
  validate({ params: returnIdParamsSchema, body: inspectReturnBodySchema }),
  returnController.inspect,
);

adminReturnRouter.post(
  '/:returnId/resolve',
  ...requirePermissions(returnPermissions.admin),
  validate({ params: returnIdParamsSchema, body: resolveReturnBodySchema }),
  returnController.resolve,
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
