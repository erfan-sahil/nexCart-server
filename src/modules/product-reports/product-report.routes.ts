import { Router } from 'express';

import { requireAnyPermissions, requirePermissions } from '../../common/middleware/authorize';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';
import { productReportController, productReportPermissions } from './product-report.controller';
import {
  createProductReportSchema,
  listProductReportsQuerySchema,
  productIdParamsSchema,
  reportIdParamsSchema,
  updateProductReportStatusSchema,
} from './product-report.validator';

export const productReportOnProductRouter = Router({ mergeParams: false });

productReportOnProductRouter.get(
  '/:productId/reports/mine',
  authenticate,
  validate({ params: productIdParamsSchema }),
  productReportController.getMine,
);

productReportOnProductRouter.post(
  '/:productId/reports',
  authenticate,
  validate({ params: productIdParamsSchema, body: createProductReportSchema }),
  productReportController.create,
);

export const productReportInboxRouter = Router();

productReportInboxRouter.get(
  '/',
  ...requireAnyPermissions(...productReportPermissions.list),
  validate({ query: listProductReportsQuerySchema }),
  productReportController.list,
);

productReportInboxRouter.patch(
  '/:reportId',
  ...requirePermissions(productReportPermissions.updateStatus),
  validate({ params: reportIdParamsSchema, body: updateProductReportStatusSchema }),
  productReportController.updateStatus,
);
