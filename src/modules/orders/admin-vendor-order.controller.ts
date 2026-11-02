import type { Request, Response } from 'express';
import { Permission } from '../../common/constants/permissions';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendSuccess } from '../../common/http/sendResponse';
import { AppError } from '../../common/errors/AppError';
import { readIdempotencyKey, runIdempotent } from '../../common/utils/idempotency';
import { IdempotencyScope } from './constants';
import { adminVendorOrderStatusService } from './admin-vendor-order-status.service';
import type { UpdateAdminVendorOrderStatusBody } from './vendor-order.validator';

const adminUserId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const vendorOrderId = Array.isArray(req.params.vendorOrderId)
    ? req.params.vendorOrderId[0]
    : req.params.vendorOrderId;
  const body = req.body as UpdateAdminVendorOrderStatusBody;

  const data = await runIdempotent({
    customerId: adminUserId(req),
    scope: IdempotencyScope.adminVendorOrderStatus,
    key: readIdempotencyKey(req.headers['idempotency-key']),
    requestBody: body,
    handler: async () => ({
      statusCode: 200,
      body: await adminVendorOrderStatusService.updateStatus(
        adminUserId(req),
        vendorOrderId ?? '',
        body,
      ),
    }),
  });

  sendSuccess(res, data, { message: 'Vendor order status updated' });
});

export const adminVendorOrderController = {
  updateStatus,
};

export const adminVendorOrderPermissions = {
  updateStatus: Permission.adminOrders,
};
