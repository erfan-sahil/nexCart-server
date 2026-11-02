import { Router } from 'express';
import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { adminOrderController, adminOrderPermissions } from './admin-order.controller';
import { vendorOrderController, vendorOrderPermissions } from './vendor-order.controller';
import {
  adminOrderIdParamsSchema,
  listAdminOrdersQuerySchema,
  listVendorOrdersQuerySchema,
  vendorOrderIdParamsSchema,
} from './vendor-order.validator';

export const vendorOrderRouter = Router();

vendorOrderRouter.get(
  '/summary',
  ...requirePermissions(vendorOrderPermissions.summary),
  vendorOrderController.summary,
);

vendorOrderRouter.get(
  '/',
  ...requirePermissions(vendorOrderPermissions.list),
  validate({ query: listVendorOrdersQuerySchema }),
  vendorOrderController.list,
);

vendorOrderRouter.get(
  '/:vendorOrderId',
  ...requirePermissions(vendorOrderPermissions.read),
  validate({ params: vendorOrderIdParamsSchema }),
  vendorOrderController.getById,
);

vendorOrderRouter.post(
  '/:vendorOrderId/accept',
  ...requirePermissions(vendorOrderPermissions.accept),
  validate({ params: vendorOrderIdParamsSchema }),
  vendorOrderController.accept,
);

vendorOrderRouter.post(
  '/:vendorOrderId/prepare',
  ...requirePermissions(vendorOrderPermissions.prepare),
  validate({ params: vendorOrderIdParamsSchema }),
  vendorOrderController.prepare,
);

vendorOrderRouter.post(
  '/:vendorOrderId/ready',
  ...requirePermissions(vendorOrderPermissions.ready),
  validate({ params: vendorOrderIdParamsSchema }),
  vendorOrderController.markReady,
);

export const adminOrderManagementRouter = Router();

adminOrderManagementRouter.get(
  '/',
  ...requirePermissions(adminOrderPermissions.list),
  validate({ query: listAdminOrdersQuerySchema }),
  adminOrderController.list,
);

adminOrderManagementRouter.get(
  '/:orderId',
  ...requirePermissions(adminOrderPermissions.read),
  validate({ params: adminOrderIdParamsSchema }),
  adminOrderController.getById,
);

adminOrderManagementRouter.post(
  '/:orderId/cancel',
  ...requirePermissions(adminOrderPermissions.cancel),
  validate({ params: adminOrderIdParamsSchema }),
  adminOrderController.cancel,
);
