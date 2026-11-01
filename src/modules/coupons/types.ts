import type { COUPON_DISCOUNT_TYPES } from './constants';

export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number];

export type CouponDto = {
  id: string;
  code: string;
  label: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minimumSubtotal: number;
  startsAt: string;
  endsAt: string;
  usageLimit: number | null;
  perCustomerLimit: number;
  usedCount: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ResolvedCheckoutCoupon = {
  couponId: string;
  couponCode: string;
  couponDiscount: number;
};
