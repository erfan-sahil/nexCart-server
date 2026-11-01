import type { CouponDiscountType } from './types';

export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const couponDiscountFromSubtotal = (
  itemsSubtotal: number,
  discountType: CouponDiscountType,
  discountValue: number,
) => {
  const subtotal = money(itemsSubtotal);

  if (subtotal <= 0) {
    return 0;
  }

  if (discountType === 'percent') {
    return money(Math.min(subtotal, subtotal * (discountValue / 100)));
  }

  return money(Math.min(subtotal, discountValue));
};
