import type { Request, Response } from 'express';
import { couponService } from './coupon.service';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendCreated, sendPaginated, sendSuccess } from '../../common/http/sendResponse';
import type {
  CreateCouponInput,
  ListCouponsQuery,
  SetCouponEnabledInput,
  UpdateCouponInput,
} from './coupon.validator';

const routeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListCouponsQuery;
  const result = await couponService.list(query);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const create = asyncHandler(async (req: Request, res: Response) => {
  const coupon = await couponService.create(req.body as CreateCouponInput);
  sendCreated(res, coupon, 'Coupon created');
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const coupon = await couponService.update(
    routeParam(req.params.id),
    req.body as UpdateCouponInput,
  );
  sendSuccess(res, coupon, { message: 'Coupon updated' });
});

const setEnabled = asyncHandler(async (req: Request, res: Response) => {
  const coupon = await couponService.setEnabled(
    routeParam(req.params.id),
    req.body as SetCouponEnabledInput,
  );
  sendSuccess(res, coupon, {
    message: coupon.isEnabled ? 'Coupon activated' : 'Coupon deactivated',
  });
});

export const couponController = {
  list,
  create,
  update,
  setEnabled,
};
