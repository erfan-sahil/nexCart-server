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
  dispatchInboundSchema,
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

vendorOrderRouter.post(
  '/:vendorOrderId/inbound',
  ...requirePermissions(vendorOrderPermissions.dispatchInbound),
  validate({ params: vendorOrderIdParamsSchema, body: dispatchInboundSchema }),
  vendorOrderController.dispatchInbound,
);

vendorOrderRouter.post(
  '/:vendorOrderId/inbound/in-transit',
  ...requirePermissions(vendorOrderPermissions.markInboundInTransit),
  validate({ params: vendorOrderIdParamsSchema }),
  vendorOrderController.markInboundInTransit,
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
