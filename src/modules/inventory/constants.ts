export const STOCK_LEVELS = ['in_stock', 'low_stock', 'out_of_stock'] as const;

export const DEFAULT_LOW_STOCK_AT = 5;

export const MAX_LOW_STOCK_AT = 10_000;

export const INVENTORY_PRODUCT_SORTS = [
  'name',
  '-name',
  'totalStock',
  '-totalStock',
  'sellableStock',
  '-sellableStock',
  'updatedAt',
  '-updatedAt',
] as const;

export const INVENTORY_VARIANT_SORTS = [
  'sku',
  '-sku',
  'stock',
  '-stock',
  'price',
  '-price',
  'updatedAt',
  '-updatedAt',
] as const;
