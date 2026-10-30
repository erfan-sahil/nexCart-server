import { Router } from 'express';
import { requirePermissions } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { fulfillmentController, fulfillmentPermissions } from './fulfillment.controller';
import {
  codCollectionSchema,
  deliverOrderSchema,
  dispatchFulfillmentSchema,
  fulfillmentIdParamsSchema,
  inspectFulfillmentSchema,
  listVendorFulfillmentsQuerySchema,
  orderIdParamsSchema,
  receiveFulfillmentSchema,
  shipOrderSchema,
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

vendorFulfillmentRouter.post(
  '/:fulfillmentId/dispatch',
  ...requirePermissions(fulfillmentPermissions.vendorDispatch),
  validate({ params: fulfillmentIdParamsSchema, body: dispatchFulfillmentSchema }),
  fulfillmentController.dispatch,
);

export const adminFulfillmentRouter = Router();

adminFulfillmentRouter.get(
  '/:fulfillmentId',
  ...requirePermissions(fulfillmentPermissions.adminRead),
  validate({ params: fulfillmentIdParamsSchema }),
  fulfillmentController.getAdminFulfillment,
);

adminFulfillmentRouter.post(
  '/:fulfillmentId/receive',
  ...requirePermissions(fulfillmentPermissions.adminWarehouse),
  validate({ params: fulfillmentIdParamsSchema, body: receiveFulfillmentSchema }),
  fulfillmentController.receive,
);

adminFulfillmentRouter.post(
  '/:fulfillmentId/inspect',
  ...requirePermissions(fulfillmentPermissions.adminWarehouse),
  validate({ params: fulfillmentIdParamsSchema, body: inspectFulfillmentSchema }),
  fulfillmentController.inspect,
);

export const adminOrderFulfillmentRouter = Router();

adminOrderFulfillmentRouter.get(
  '/:orderId/fulfillment',
  ...requirePermissions(fulfillmentPermissions.adminRead),
  validate({ params: orderIdParamsSchema }),
  fulfillmentController.getOrderFulfillment,
);

adminOrderFulfillmentRouter.post(
  '/:orderId/shipment/pack',
  ...requirePermissions(fulfillmentPermissions.adminWarehouse),
  validate({ params: orderIdParamsSchema }),
  fulfillmentController.packShipment,
);

adminOrderFulfillmentRouter.post(
  '/:orderId/shipment/ship',
  ...requirePermissions(fulfillmentPermissions.adminWarehouse),
  validate({ params: orderIdParamsSchema, body: shipOrderSchema }),
  fulfillmentController.shipOrder,
);

adminOrderFulfillmentRouter.post(
  '/:orderId/shipment/deliver',
  ...requirePermissions(fulfillmentPermissions.adminWarehouse),
  validate({ params: orderIdParamsSchema, body: deliverOrderSchema }),
  fulfillmentController.deliverOrder,
);

adminOrderFulfillmentRouter.post(
  '/:orderId/cod-collection',
  ...requirePermissions(fulfillmentPermissions.adminWarehouse),
  validate({ params: orderIdParamsSchema, body: codCollectionSchema }),
  fulfillmentController.recordCodCollection,
);
