import type { Request, Response } from 'express';
import { Permission } from '../../common/constants/permissions';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendPaginated, sendSuccess } from '../../common/http/sendResponse';
import { AppError } from '../../common/errors/AppError';
import { readIdempotencyKey, runIdempotent } from '../../common/utils/idempotency';
import { IdempotencyScope } from './constants';
import { vendorOrderService } from './vendor-order.service';
import type { ListVendorOrdersQuery, UpdateVendorOrderStatusBody } from './vendor-order.validator';

const vendorUserId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListVendorOrdersQuery;
  const result = await vendorOrderService.listForVendor(vendorUserId(req), query);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const summary = asyncHandler(async (req: Request, res: Response) => {
  const data = await vendorOrderService.summaryForVendor(vendorUserId(req));
  sendSuccess(res, data);
});

const getById = asyncHandler(async (req: Request, res: Response) => {
  const vendorOrderId = Array.isArray(req.params.vendorOrderId)
    ? req.params.vendorOrderId[0]
    : req.params.vendorOrderId;
  const data = await vendorOrderService.getForVendor(vendorUserId(req), vendorOrderId ?? '');

  sendSuccess(res, data);
});

const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const vendorOrderId = Array.isArray(req.params.vendorOrderId)
    ? req.params.vendorOrderId[0]
    : req.params.vendorOrderId;
  const body = req.body as UpdateVendorOrderStatusBody;
  const actorId = vendorUserId(req);
  const data = await runIdempotent({
    customerId: actorId,
    scope: IdempotencyScope.vendorOrderStatus,
    key: readIdempotencyKey(req.headers['idempotency-key']),
    requestBody: body,
    handler: async () => ({
      statusCode: 200,
      body: await vendorOrderService.updateStatus(actorId, vendorOrderId ?? '', body),
    }),
  });

  sendSuccess(res, data, { message: 'Order status updated' });
});

export const vendorOrderController = {
  list,
  summary,
  getById,
  updateStatus,
};

export const vendorOrderPermissions = {
  list: Permission.vendorOrders,
  read: Permission.vendorOrders,
  summary: Permission.vendorOrders,
  updateStatus: Permission.vendorOrders,
};
