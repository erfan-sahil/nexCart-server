import type { Request, Response } from 'express';
import { Permission } from '../../common/constants/permissions';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendPaginated, sendSuccess } from '../../common/http/sendResponse';
import { AppError } from '../../common/errors/AppError';
import { returnService } from './return.service';
import type { ListReturnsQuery } from './return.validator';

const adminId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const vendorUserId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const listVendor = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListReturnsQuery;
  const result = await returnService.listForVendor(vendorUserId(req), query.page, query.limit);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const listAdmin = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListReturnsQuery;
  const result = await returnService.listForAdmin(query.page, query.limit);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const approve = asyncHandler(async (req: Request, res: Response) => {
  const returnId = Array.isArray(req.params.returnId)
    ? req.params.returnId[0]
    : req.params.returnId;
  const data = await returnService.approve(adminId(req), returnId ?? '');
  sendSuccess(res, data, { message: 'Return approved' });
});

const refund = asyncHandler(async (req: Request, res: Response) => {
  const returnId = Array.isArray(req.params.returnId)
    ? req.params.returnId[0]
    : req.params.returnId;
  const data = await returnService.markRefunded(adminId(req), returnId ?? '');
  sendSuccess(res, data, { message: 'Return refunded' });
});

export const returnPermissions = {
  vendor: Permission.vendorOrders,
  admin: Permission.adminOrders,
} as const;

export const returnController = {
  listVendor,
  listAdmin,
  approve,
  refund,
};
