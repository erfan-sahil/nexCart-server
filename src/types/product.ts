import type { IMAGE_PROVIDERS, PRODUCT_STATUSES } from '../constants/product';
import type { AttributeRole, AttributeType } from './attribute';
import type { UserRole } from './auth';

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

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
  tags: string[];
  status: ProductStatus;
  isFeatured: boolean;
  isPublished: boolean;
  ratingSummary: {
    average: number;
    count: number;
  };
  createdAt: string;
  updatedAt: string;
};
