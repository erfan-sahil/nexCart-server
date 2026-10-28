import type { VARIANT_STATUSES } from '../constants/variant';
import type { ProductAttributeDto, ProductImageDto } from './product';

export type VariantStatus = (typeof VARIANT_STATUSES)[number];

export type VariantDto = {
  id: string;
  productId: string;
  sku: string;
  price: number;
  discountType: 'percent' | 'amount' | null;
  discountValue: number | null;
  dealStartsAt: string | null;
  dealEndsAt: string | null;
  currentPrice: number;
  stock: number;
  image: ProductImageDto | null;
  attributes: ProductAttributeDto[];
  status: VariantStatus;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};
