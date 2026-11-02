import { Router } from 'express';
import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import {
  adminVendorOrderController,
  adminVendorOrderPermissions,
} from './admin-vendor-order.controller';
import {
  updateAdminVendorOrderStatusSchema,
  vendorOrderIdParamsSchema,
} from './vendor-order.validator';

export const adminVendorOrderRouter = Router();

adminVendorOrderRouter.post(
  '/:vendorOrderId/status',
  ...requirePermissions(adminVendorOrderPermissions.updateStatus),
  validate({ params: vendorOrderIdParamsSchema, body: updateAdminVendorOrderStatusSchema }),
  adminVendorOrderController.updateStatus,
);
