import type { Request, Response } from 'express';
import { Permission } from '../../constants/permissions';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/sendResponse';
import { recentlyViewedService } from './recently-viewed.service';
import type { RecordRecentlyViewedInput } from './recently-viewed.validator';

const actorId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const param = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const list = asyncHandler(async (req: Request, res: Response) => {
  const data = await recentlyViewedService.list(actorId(req));

  sendSuccess(res, data, { message: 'Recently viewed' });
});

const record = asyncHandler(async (req: Request, res: Response) => {
  const { productId } = req.body as RecordRecentlyViewedInput;
  const result = await recentlyViewedService.record(actorId(req), productId);

  sendCreated(res, result.product, 'Product view recorded');
});

const remove = asyncHandler(async (req: Request, res: Response) => {
  await recentlyViewedService.remove(actorId(req), param(req.params.productId));

  sendNoContent(res);
});

const clear = asyncHandler(async (req: Request, res: Response) => {
  await recentlyViewedService.clear(actorId(req));

  sendNoContent(res);
});

export const recentlyViewedController = {
  list,
  record,
  remove,
  clear,
};

export const recentlyViewedPermissions = {
  list: Permission.customerRecentlyViewed,
  record: Permission.customerRecentlyViewed,
  remove: Permission.customerRecentlyViewed,
  clear: Permission.customerRecentlyViewed,
};
