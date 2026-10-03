import type { PAYOUT_METHODS } from '../constants/store';
import type { VendorAddressDto } from './vendorApplication';

export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export type StoreCategoryDto = {
  id: string;
  name: string;
  slug: string;
};

export type StoreRatingDto = {
  average: number;
  count: number;
};

export type StoreContactDto = {
  email: string;
  phone: string;
};

export type PublicStoreSummaryDto = {
  id: string;
  slug: string;
  name: string;
  logo: string;
  rating: StoreRatingDto;
  totalProducts: number;
  totalOrders: number;
  totalSales: number;
  joinedAt: string;
};

export type PublicStoreDto = PublicStoreSummaryDto & {
  banner: string;
  description: string;
  contact: StoreContactDto;
  address: VendorAddressDto;
  categories: StoreCategoryDto[];
  returnPolicy: string;
  shippingPolicy: string;
};

export type VendorStoreDto = PublicStoreDto & {
  isActive: boolean;
  payout: StorePayoutDto | null;
};

export type BankPayoutDto = {
  method: 'bank';
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  branchName: string;
  routingNumber: string;
  updatedAt: string;
};

export type MobilePayoutDto = {
  method: 'mobile';
  accountHolderName: string;
  provider: string;
  accountNumber: string;
  updatedAt: string;
};

export type StorePayoutDto = BankPayoutDto | MobilePayoutDto;
