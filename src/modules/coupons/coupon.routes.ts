import { Router } from 'express';
import { Permission } from '../../common/constants/permissions';
import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { couponController } from './coupon.controller';
import {
  couponIdParamsSchema,
  createCouponSchema,
  listCouponsQuerySchema,
  setCouponEnabledSchema,
  updateCouponSchema,
} from './coupon.validator';

export const couponRouter = Router();

couponRouter.get(
  '/',
  ...requirePermissions(Permission.adminCoupons),
  validate({ query: listCouponsQuerySchema }),
  couponController.list,
);

couponRouter.post(
  '/',
  ...requirePermissions(Permission.adminCoupons),
  validate({ body: createCouponSchema }),
  couponController.create,
);

couponRouter.patch(
  '/:id',
  ...requirePermissions(Permission.adminCoupons),
  validate({ params: couponIdParamsSchema, body: updateCouponSchema }),
  couponController.update,
);

couponRouter.patch(
  '/:id/enabled',
  ...requirePermissions(Permission.adminCoupons),
  validate({ params: couponIdParamsSchema, body: setCouponEnabledSchema }),
  couponController.setEnabled,
);
