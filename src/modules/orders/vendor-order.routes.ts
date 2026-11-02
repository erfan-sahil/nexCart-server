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
  updateVendorOrderStatusSchema,
  updateAdminOrderStatusSchema,
  codCollectionSchema,
  codRemittanceSchema,
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
  '/:vendorOrderId/status',
  ...requirePermissions(vendorOrderPermissions.updateStatus),
  validate({ params: vendorOrderIdParamsSchema, body: updateVendorOrderStatusSchema }),
  vendorOrderController.updateStatus,
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

adminOrderManagementRouter.post(
  '/:orderId/status',
  ...requirePermissions(adminOrderPermissions.read),
  validate({ params: adminOrderIdParamsSchema, body: updateAdminOrderStatusSchema }),
  adminOrderController.updateStatus,
);

adminOrderManagementRouter.post(
  '/:orderId/cod/collect',
  ...requirePermissions(adminOrderPermissions.read),
  validate({ params: adminOrderIdParamsSchema, body: codCollectionSchema }),
  adminOrderController.codCollect,
);

adminOrderManagementRouter.post(
  '/:orderId/cod/remit',
  ...requirePermissions(adminOrderPermissions.read),
  validate({ params: adminOrderIdParamsSchema, body: codRemittanceSchema }),
  adminOrderController.codRemit,
);

adminOrderManagementRouter.post(
  '/:orderId/cod/reconcile',
  ...requirePermissions(adminOrderPermissions.read),
  validate({ params: adminOrderIdParamsSchema }),
  adminOrderController.codReconcile,
);
