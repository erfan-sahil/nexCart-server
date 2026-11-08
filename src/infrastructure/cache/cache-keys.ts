import { env } from '../../config/env';

/** Cache key names (the Redis key prefix is added by the cache service). */
export const CACHE_KEYS = {
  siteSettings: 'cache:site-settings',
  hero: 'cache:hero',
  flashDealMeta: 'cache:flash-deals:meta',
  catalogHome: 'cache:catalog:home',
  categoriesPrefix: 'cache:categories:',
  categoryFeatured: 'cache:categories:featured',
  categoryTree: (isActive?: boolean) => `cache:categories:tree:${isActive ?? 'all'}`,
  categoryBySlug: (slug: string) => `cache:categories:slug:${slug}`,
} as const;

/** TTLs in seconds. Data without write-time invalidation uses a short TTL to bound staleness. */
export const CACHE_TTL = {
  siteSettings: 300,
  hero: 300,
  categories: 300,
  flashDealMeta: 30,
  catalogHome: env.CACHE_DEFAULT_TTL_SECONDS,
} as const;
