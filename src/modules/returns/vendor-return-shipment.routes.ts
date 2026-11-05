import { Router } from 'express';
import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import {
  vendorReturnShipmentController,
  vendorReturnShipmentPermissions,
} from './vendor-return-shipment.controller';
import {
  dispatchVendorReturnShipmentBodySchema,
  listVendorReturnShipmentsQuerySchema,
  vendorReturnShipmentIdParamsSchema,
} from './vendor-return-shipment.validator';

export const vendorVendorReturnShipmentRouter = Router();

vendorVendorReturnShipmentRouter.get(
  '/',
  ...requirePermissions(vendorReturnShipmentPermissions.vendor),
  validate({ query: listVendorReturnShipmentsQuerySchema }),
  vendorReturnShipmentController.listVendor,
);

vendorVendorReturnShipmentRouter.get(
  '/:shipmentId',
  ...requirePermissions(vendorReturnShipmentPermissions.vendor),
  validate({ params: vendorReturnShipmentIdParamsSchema }),
  vendorReturnShipmentController.getVendor,
);

vendorVendorReturnShipmentRouter.post(
  '/:shipmentId/confirm-receipt',
  ...requirePermissions(vendorReturnShipmentPermissions.vendor),
  validate({ params: vendorReturnShipmentIdParamsSchema }),
  vendorReturnShipmentController.confirmReceipt,
);

export const adminVendorReturnShipmentRouter = Router();

adminVendorReturnShipmentRouter.get(
  '/',
  ...requirePermissions(vendorReturnShipmentPermissions.admin),
  validate({ query: listVendorReturnShipmentsQuerySchema }),
  vendorReturnShipmentController.listAdmin,
);

adminVendorReturnShipmentRouter.get(
  '/:shipmentId',
  ...requirePermissions(vendorReturnShipmentPermissions.admin),
  validate({ params: vendorReturnShipmentIdParamsSchema }),
  vendorReturnShipmentController.getAdmin,
);

adminVendorReturnShipmentRouter.post(
  '/:shipmentId/dispatch',
  ...requirePermissions(vendorReturnShipmentPermissions.admin),
  validate({
    params: vendorReturnShipmentIdParamsSchema,
    body: dispatchVendorReturnShipmentBodySchema,
  }),
  vendorReturnShipmentController.dispatch,
);
