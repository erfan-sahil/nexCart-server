import { z } from 'zod';
import { PRODUCT_APPROVAL_STATUSES, PRODUCT_STATUSES } from '../constants/product';
import {
  DEFAULT_LOW_STOCK_AT,
  INVENTORY_PRODUCT_SORTS,
  INVENTORY_VARIANT_SORTS,
  MAX_LOW_STOCK_AT,
  STOCK_LEVELS,
} from '../constants/inventory';
import { VARIANT_STATUSES } from '../constants/variant';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const pageFields = {
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(80).optional(),
  stockLevel: z.enum(STOCK_LEVELS).optional(),
  lowStockAt: z.coerce.number().int().min(1).max(MAX_LOW_STOCK_AT).default(DEFAULT_LOW_STOCK_AT),
};

export const listInventoryProductsQuerySchema = z.object({
  ...pageFields,
  sort: z.enum(INVENTORY_PRODUCT_SORTS).default('-updatedAt'),
  storeId: objectIdSchema.optional(),
  categoryId: objectIdSchema.optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  approvalStatus: z.enum(PRODUCT_APPROVAL_STATUSES).optional(),
});

export const listInventoryVariantsQuerySchema = z.object({
  ...pageFields,
  sort: z.enum(INVENTORY_VARIANT_SORTS).default('-updatedAt'),
  storeId: objectIdSchema.optional(),
  productId: objectIdSchema.optional(),
  status: z.enum(VARIANT_STATUSES).optional(),
});

export const inventoryProductParamsSchema = z.object({
  productId: objectIdSchema,
});

export const inventoryProductVariantsQuerySchema = z.object({
  page: pageFields.page,
  limit: pageFields.limit,
  search: pageFields.search,
  stockLevel: pageFields.stockLevel,
  lowStockAt: pageFields.lowStockAt,
  sort: z.enum(INVENTORY_VARIANT_SORTS).default('sku'),
  status: z.enum(VARIANT_STATUSES).optional(),
});

export const inventorySummaryQuerySchema = z.object({
  storeId: objectIdSchema.optional(),
  categoryId: objectIdSchema.optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  approvalStatus: z.enum(PRODUCT_APPROVAL_STATUSES).optional(),
  lowStockAt: pageFields.lowStockAt,
});

export type ListInventoryProductsQuery = z.infer<typeof listInventoryProductsQuerySchema>;
export type ListInventoryVariantsQuery = z.infer<typeof listInventoryVariantsQuerySchema>;
export type InventoryProductVariantsQuery = z.infer<typeof inventoryProductVariantsQuerySchema>;
export type InventorySummaryQuery = z.infer<typeof inventorySummaryQuerySchema>;
