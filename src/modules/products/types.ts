import type { IMAGE_PROVIDERS, PRODUCT_APPROVAL_STATUSES, PRODUCT_STATUSES } from './constants';
import type { AttributeRole, AttributeType } from '../attributes/types';
import type { UserRole } from '../auth/types';

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export type ProductApprovalStatus = (typeof PRODUCT_APPROVAL_STATUSES)[number];

export type ImageProvider = (typeof IMAGE_PROVIDERS)[number];

export type ProductViewer = {
  id: string;
  role: UserRole;
};

export type ProductImageDto = {
  id: string;
  provider: ImageProvider;
  url: string;
  mimeType: string;
  size: number;
  alt: string;
  sortOrder: number;
};

export type ProductAttributeOptionDto = {
  id: string;
  label: string;
  value: string;
};

export type ProductAttributeDto = {
  attributeId: string;
  name: string;
  slug: string;
  type: AttributeType;
  role: AttributeRole;
  unit: string;
  text: string | null;
  number: number | null;
  boolean: boolean | null;
  options: ProductAttributeOptionDto[];
};

export type ProductSummaryRef = {
  id: string;
  name: string;
  slug: string;
};

export type ProductOfferDto = {
  minPrice: number | null;
  maxPrice: number | null;
  minOriginalPrice: number | null;
  maxOriginalPrice: number | null;
  inStock: boolean;
  variantCount: number;
  defaultVariantId: string | null;
};

export type ProductDto = {
  id: string;
  storeId: string;
  categoryId: string;
  store: ProductSummaryRef;
  category: ProductSummaryRef;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  images: ProductImageDto[];
  thumbnail: ProductImageDto | null;
  attributes: ProductAttributeDto[];
  offer: ProductOfferDto;
  tags: string[];
  status: ProductStatus;
  approvalStatus: ProductApprovalStatus;
  reviewNote: string;
  isFeatured: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  ratingSummary: {
    average: number;
    count: number;
    distribution: {
      star1: number;
      star2: number;
      star3: number;
      star4: number;
      star5: number;
    };
  };
  createdAt: string;
  updatedAt: string;
};
