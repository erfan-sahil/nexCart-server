import type { Request, Response } from 'express';
import { Permission } from '../../common/constants/permissions';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendPaginated, sendSuccess } from '../../common/http/sendResponse';
import { AppError } from '../../common/errors/AppError';
import { vendorOrderService } from './vendor-order.service';
import type { ListAdminOrdersQuery } from './vendor-order.validator';

const adminUserId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListAdminOrdersQuery;
  const result = await vendorOrderService.listForAdmin(query);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const getById = asyncHandler(async (req: Request, res: Response) => {
  const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
  const data = await vendorOrderService.getForAdmin(orderId ?? '');

  sendSuccess(res, data);
});

const cancel = asyncHandler(async (req: Request, res: Response) => {
  const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
  const data = await vendorOrderService.cancelByAdmin(adminUserId(req), orderId ?? '');

  sendSuccess(res, data, { message: 'Order cancelled' });
});

export const adminOrderController = {
  list,
  getById,
  cancel,
};

export const adminOrderPermissions = {
  list: Permission.adminOrders,
  read: Permission.adminOrders,
  cancel: Permission.adminOrders,
};
