import { Router } from 'express';
import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { fulfillmentController, fulfillmentPermissions } from './fulfillment.controller';
import {
  fulfillmentIdParamsSchema,
  listAdminFulfillmentsQuerySchema,
  listVendorFulfillmentsQuerySchema,
  orderIdParamsSchema,
} from './fulfillment.validator';

export const vendorFulfillmentRouter = Router();

vendorFulfillmentRouter.get(
  '/',
  ...requirePermissions(fulfillmentPermissions.vendorList),
  validate({ query: listVendorFulfillmentsQuerySchema }),
  fulfillmentController.listVendor,
);

vendorFulfillmentRouter.get(
  '/:fulfillmentId',
  ...requirePermissions(fulfillmentPermissions.vendorRead),
  validate({ params: fulfillmentIdParamsSchema }),
  fulfillmentController.getVendor,
);

export const adminFulfillmentRouter = Router();

adminFulfillmentRouter.get(
  '/',
  ...requirePermissions(fulfillmentPermissions.adminRead),
  validate({ query: listAdminFulfillmentsQuerySchema }),
  fulfillmentController.listAdmin,
);

adminFulfillmentRouter.get(
  '/:fulfillmentId',
  ...requirePermissions(fulfillmentPermissions.adminRead),
  validate({ params: fulfillmentIdParamsSchema }),
  fulfillmentController.getAdminFulfillment,
);

export const adminOrderFulfillmentRouter = Router();

adminOrderFulfillmentRouter.get(
  '/:orderId/fulfillment',
  ...requirePermissions(fulfillmentPermissions.adminRead),
  validate({ params: orderIdParamsSchema }),
  fulfillmentController.getOrderFulfillment,
);
