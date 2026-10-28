export const CATALOG_COLLECTIONS = [
  'flash-deals',
  'bestsellers',
  'trending',
  'new-arrivals',
] as const;

export const RESERVED_CATALOG_COLLECTIONS = ['recommended', 'recently-viewed'] as const;

export const CATALOG_COLLECTION_PARAMS = [
  ...CATALOG_COLLECTIONS,
  ...RESERVED_CATALOG_COLLECTIONS,
] as const;

export const CATALOG_SORTS = [
  'newest',
  'bestsellers',
  'price-asc',
  'price-desc',
  'rating',
  'featured',
] as const;

export const CATALOG_SIGNAL_KINDS = ['sale', 'view'] as const;

export const HOME_SECTION_LIMITS = {
  flashDeals: 6,
  topSelling: 8,
  popularStores: 6,
  trending: 8,
  newArrivals: 8,
} as const;

export const SALES_WINDOW_DAYS = 30;

export const TRENDING_WINDOW_DAYS = 7;

export const TRENDING_SALE_WEIGHT = 5;

export const RELATED_PRODUCT_LIMIT = 8;

export const RELATED_CANDIDATE_LIMIT = 40;

export const MAX_RELATED_PRODUCTS = 24;
