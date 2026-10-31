import type { STOCK_LEVELS } from './constants';
import type { ProductApprovalStatus, ProductStatus } from '../products/types';
import type { VariantStatus } from '../products/variant.types';

export type StockLevel = (typeof STOCK_LEVELS)[number];

export type InventoryRef = {
  id: string;
  name: string;
  slug: string;
};

export type InventoryImage = {
  id: string;
  url: string;
  alt: string;
};

export type InventoryOption = {
  name: string;
  value: string;
};

export type InventoryProduct = {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  approvalStatus: ProductApprovalStatus;
  isPublished: boolean;
  thumbnail: InventoryImage | null;
  store: InventoryRef;
  category: InventoryRef;
  defaultSku: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  variantCount: number;
  activeVariantCount: number;
  totalStock: number;
  sellableStock: number;
  lowStockVariantCount: number;
  outOfStockVariantCount: number;
  stockLevel: StockLevel;
  lowStockAt: number;
  updatedAt: string;
};

export type InventoryVariant = {
  id: string;
  sku: string;
  price: number;
  currentPrice: number;
  stock: number;
  stockLevel: StockLevel;
  lowStockAt: number;
  status: VariantStatus;
  isDefault: boolean;
  options: InventoryOption[];
  product: InventoryRef & {
    status: ProductStatus;
  };
  store: InventoryRef;
  createdAt: string;
  updatedAt: string;
};

export type InventorySummary = {
  lowStockAt: number;
  productCount: number;
  variantCount: number;
  totalUnits: number;
  sellableUnits: number;
  products: {
    inStock: number;
    lowStock: number;
    outOfStock: number;
  };
  variants: {
    inStock: number;
    lowStock: number;
    outOfStock: number;
  };
};

export type InventoryProductDetail = {
  product: InventoryProduct;
  variants: InventoryVariant[];
};
