import type { FLASH_DEAL_DISCOUNT_TYPES } from './constants';

export type FlashDealDiscountType = (typeof FLASH_DEAL_DISCOUNT_TYPES)[number];

export type FlashDealDto = {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  storeName: string;
  discountType: FlashDealDiscountType;
  discountValue: number;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
};

export type FlashDealSettingsDto = {
  sectionTitle: string;
};

export type FlashDealPublicMetaDto = {
  sectionTitle: string;
  endsAt: string | null;
};
