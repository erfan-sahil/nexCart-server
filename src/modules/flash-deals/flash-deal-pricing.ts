import type { FlashDealDiscountType } from './types';

export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const flashPriceFromListPrice = (
  listPrice: number,
  discountType: FlashDealDiscountType,
  discountValue: number,
) => {
  if (discountType === 'percent') {
    return money(listPrice * (1 - discountValue / 100));
  }

  return money(listPrice - discountValue);
};

export const isFlashPriceValid = (
  listPrice: number,
  discountType: FlashDealDiscountType,
  discountValue: number,
) => {
  const next = flashPriceFromListPrice(listPrice, discountType, discountValue);
  return next > 0;
};

export const vendorUnitPrice = (
  listPrice: number,
  discountType: 'percent' | 'amount' | null,
  discountValue: number | null,
) => {
  if (!discountType || discountValue === null) {
    return money(listPrice);
  }

  if (discountType === 'percent') {
    return money(listPrice * (1 - discountValue / 100));
  }

  return money(listPrice - discountValue);
};

export const resolveCheckoutUnitPrice = (
  listPrice: number,
  vendorDiscountType: 'percent' | 'amount' | null,
  vendorDiscountValue: number | null,
  flash: {
    discountType: FlashDealDiscountType;
    discountValue: number;
  } | null,
) => {
  if (flash && isFlashPriceValid(listPrice, flash.discountType, flash.discountValue)) {
    return flashPriceFromListPrice(listPrice, flash.discountType, flash.discountValue);
  }

  return vendorUnitPrice(listPrice, vendorDiscountType, vendorDiscountValue);
};

export const flashSavingsOnListPrice = (
  listPrice: number,
  discountType: FlashDealDiscountType,
  discountValue: number,
) => {
  if (!isFlashPriceValid(listPrice, discountType, discountValue)) {
    return 0;
  }

  return money(listPrice - flashPriceFromListPrice(listPrice, discountType, discountValue));
};
