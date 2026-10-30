import type { Request, Response } from 'express';
import { Permission } from '../../constants/permissions';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/sendResponse';
import { wishlistService } from './wishlist.service';
import type { AddWishlistInput } from './wishlist.validator';

const actorId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const param = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const list = asyncHandler(async (req: Request, res: Response) => {
  const data = await wishlistService.list(actorId(req));

  sendSuccess(res, data, { message: 'Wishlist' });
});

const add = asyncHandler(async (req: Request, res: Response) => {
  const { productId } = req.body as AddWishlistInput;
  const result = await wishlistService.add(actorId(req), productId);

  if (result.created) {
    sendCreated(res, result.product, 'Saved to wishlist');
    return;
  }

  sendSuccess(res, result.product, { message: 'Already in wishlist' });
});

const remove = asyncHandler(async (req: Request, res: Response) => {
  await wishlistService.remove(actorId(req), param(req.params.productId));

  sendNoContent(res);
});

const clear = asyncHandler(async (req: Request, res: Response) => {
  await wishlistService.clear(actorId(req));

  sendNoContent(res);
});

export const wishlistController = {
  list,
  add,
  remove,
  clear,
};

export const wishlistPermissions = {
  list: Permission.customerWishlist,
  add: Permission.customerWishlist,
  remove: Permission.customerWishlist,
  clear: Permission.customerWishlist,
};
