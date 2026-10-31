import type { FLASH_DEAL_DISCOUNT_TYPES } from './constants';

export type FlashDealDiscountType = (typeof FLASH_DEAL_DISCOUNT_TYPES)[number];

export type FlashDealItemDto = {
  id: string;
  campaignId: string;
  productId: string;
  productName: string;
  productSlug: string;
  storeName: string;
  discountType: FlashDealDiscountType;
  discountValue: number;
  createdAt: string;
  updatedAt: string;
};

export type FlashDealCampaignDto = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type FlashDealCampaignDetailDto = FlashDealCampaignDto & {
  items: FlashDealItemDto[];
};

export type FlashDealSettingsDto = {
  sectionTitle: string;
};

export type FlashDealPublicMetaDto = {
  sectionTitle: string;
  endsAt: string | null;
};
