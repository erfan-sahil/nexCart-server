import { Types, type FilterQuery, type HydratedDocument, type SortOrder } from 'mongoose';
import { CategoryModel } from '../categories/category.model';
import { OrderModel } from '../orders/order.model';
import { ProductModel, type Product } from '../products/product.model';
import { RecentlyViewedItemModel } from '../recently-viewed/recently-viewed-item.model';
import { ReviewModel } from '../reviews/review.model';
import { StoreModel, listedStoreFilter } from '../stores/store.model';
import { WishlistItemModel } from '../wishlist/wishlist-item.model';
import { catalogService } from '../catalog/catalog.service';
import { productService } from '../products/product.service';
import { AppError } from '../../common/errors/AppError';
import { escapeRegex } from '../../common/utils/slugify';
import type { ListCatalogQuery } from '../catalog/catalog.validator';
import {
  RECOMMENDED_CANDIDATE_POOL,
  RECOMMENDED_ORDER_STATUSES,
  RECOMMENDED_SIGNAL_ORDERS,
  RECOMMENDED_SIGNAL_RECENTLY_VIEWED,
  RECOMMENDED_SIGNAL_REVIEWS,
  RECOMMENDED_SIGNAL_WISHLIST,
  RECOMMENDED_TOP_CATEGORIES,
  RECOMMENDED_TOP_TAGS,
} from './constants';

type CatalogSort = NonNullable<ListCatalogQuery['sort']>;

type TasteProfile = {
  categories: Map<string, number>;
  tags: Map<string, number>;
  options: Map<string, number>;
  stores: Map<string, number>;
  excludeProductIds: Set<string>;
};

type RecommendedResult = {
  items: Awaited<ReturnType<typeof productService.presentMany>>;
  page: number;
  limit: number;
  total: number;
  personalized: boolean;
};

const SORTS: Record<CatalogSort, Record<string, SortOrder>> = {
  newest: { publishedAt: -1, _id: 1 },
  bestsellers: { 'metrics.unitsSold30d': -1, _id: 1 },
  'price-asc': { 'listing.minPrice': 1, _id: 1 },
  'price-desc': { 'listing.minPrice': -1, _id: 1 },
  rating: { 'ratingSummary.average': -1, _id: 1 },
  featured: { isFeatured: -1, publishedAt: -1, _id: 1 },
};

const listedStoreIds = () => StoreModel.find(listedStoreFilter).distinct('_id');

const customerGate = async (): Promise<FilterQuery<Product>> => ({
  approvalStatus: 'approved',
  status: 'active',
  isPublished: true,
  'listing.hasStock': true,
  storeId: { $in: await listedStoreIds() },
});

const trendingMembership = (): FilterQuery<Product> => ({
  $or: [{ 'metrics.unitsSold7d': { $gt: 0 } }, { 'metrics.views7d': { $gt: 0 } }],
});

const categoryClause = async (categoryId?: string): Promise<FilterQuery<Product> | null> => {
  if (!categoryId) {
    return null;
  }

  const category = await CategoryModel.findById(categoryId).select('_id');

  if (!category) {
    throw AppError.notFound('Category not found');
  }

  const children = await CategoryModel.find({ ancestors: category._id }).select('_id');

  return { categoryId: { $in: [category._id, ...children.map((child) => child._id)] } };
};

const searchClause = (search?: string): FilterQuery<Product> | null => {
  if (!search) {
    return null;
  }

  const pattern = { $regex: escapeRegex(search), $options: 'i' };

  return { $or: [{ name: pattern }, { shortDescription: pattern }, { tags: pattern }] };
};

const buildListingFilter = async (query: ListCatalogQuery) => {
  const clauses: FilterQuery<Product>[] = [await customerGate(), trendingMembership()];
  const category = await categoryClause(query.categoryId);
  const search = searchClause(query.search);

  if (category) {
    clauses.push(category);
  }

  if (search) {
    clauses.push(search);
  }

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    const price: { $gte?: number; $lte?: number } = {};

    if (query.minPrice !== undefined) {
      price.$gte = query.minPrice;
    }

    if (query.maxPrice !== undefined) {
      price.$lte = query.maxPrice;
    }

    clauses.push({ 'listing.minPrice': price });
  }

  if (query.minRating !== undefined) {
    clauses.push({ 'ratingSummary.average': { $gte: query.minRating } });
  }

  return { $and: clauses };
};

const optionIdsOf = (product: Product) =>
  (product.attributes ?? []).flatMap((attribute) => attribute.optionIds ?? []);

const addWeight = (map: Map<string, number>, key: string, delta: number) => {
  if (!key || delta === 0) {
    return;
  }

  map.set(key, (map.get(key) ?? 0) + delta);
};

const topKeys = (map: Map<string, number>, limit: number) =>
  [...map.entries()]
    .filter(([, weight]) => weight > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([key]) => key);

const applyProductSignal = (
  profile: TasteProfile,
  product: Product,
  weight: number,
  excludeFromRecommendations: boolean,
) => {
  const id = String(product._id);

  if (excludeFromRecommendations) {
    profile.excludeProductIds.add(id);
  }

  addWeight(profile.categories, String(product.categoryId), weight);
  addWeight(profile.stores, String(product.storeId), weight * 0.5);

  for (const tag of product.tags ?? []) {
    addWeight(profile.tags, tag, weight);
  }

  for (const optionId of optionIdsOf(product)) {
    addWeight(profile.options, String(optionId), weight * 0.75);
  }
};

const hasSignals = (profile: TasteProfile) =>
  profile.categories.size > 0 ||
  profile.tags.size > 0 ||
  profile.options.size > 0 ||
  profile.stores.size > 0;

const loadTasteProfile = async (userId: string): Promise<TasteProfile | null> => {
  const userObjectId = new Types.ObjectId(userId);
  const [views, wishlist, orders, reviews] = await Promise.all([
    RecentlyViewedItemModel.find({ userId: userObjectId })
      .sort({ viewedAt: -1 })
      .limit(RECOMMENDED_SIGNAL_RECENTLY_VIEWED)
      .select('productId viewedAt')
      .lean(),
    WishlistItemModel.find({ userId: userObjectId })
      .sort({ createdAt: -1 })
      .limit(RECOMMENDED_SIGNAL_WISHLIST)
      .select('productId')
      .lean(),
    OrderModel.find({
      customerId: userObjectId,
      status: { $in: [...RECOMMENDED_ORDER_STATUSES] },
    })
      .sort({ createdAt: -1 })
      .limit(RECOMMENDED_SIGNAL_ORDERS)
      .select('items.productId')
      .lean(),
    ReviewModel.find({
      authorId: userObjectId,
      parentId: null,
      rating: { $ne: null },
    })
      .sort({ createdAt: -1 })
      .limit(RECOMMENDED_SIGNAL_REVIEWS)
      .select('productId rating')
      .lean(),
  ]);

  const productIds = new Set<string>();

  for (const row of views) {
    productIds.add(String(row.productId));
  }

  for (const row of wishlist) {
    productIds.add(String(row.productId));
  }

  for (const order of orders) {
    for (const item of order.items) {
      productIds.add(String(item.productId));
    }
  }

  for (const review of reviews) {
    productIds.add(String(review.productId));
  }

  if (productIds.size === 0) {
    return null;
  }

  const products = await ProductModel.find({
    _id: { $in: [...productIds].map((id) => new Types.ObjectId(id)) },
  });
  const byId = new Map(products.map((product) => [String(product._id), product]));
  const profile: TasteProfile = {
    categories: new Map(),
    tags: new Map(),
    options: new Map(),
    stores: new Map(),
    excludeProductIds: new Set(),
  };

  const now = Date.now();

  for (const row of views) {
    const product = byId.get(String(row.productId));

    if (!product) {
      continue;
    }

    const ageDays = Math.max(0, (now - new Date(row.viewedAt).getTime()) / 86_400_000);
    const recency = Math.max(0.35, 1 - ageDays / 30);
    applyProductSignal(profile, product, 2 * recency, true);
  }

  for (const row of wishlist) {
    const product = byId.get(String(row.productId));

    if (!product) {
      continue;
    }

    applyProductSignal(profile, product, 4, true);
  }

  for (const order of orders) {
    for (const item of order.items) {
      const product = byId.get(String(item.productId));

      if (!product) {
        continue;
      }

      applyProductSignal(profile, product, 6, true);
    }
  }

  for (const review of reviews) {
    const product = byId.get(String(review.productId));
    const rating = review.rating;

    if (!product || typeof rating !== 'number') {
      continue;
    }

    if (rating >= 4) {
      applyProductSignal(profile, product, 3, false);
    } else if (rating <= 2) {
      applyProductSignal(profile, product, -2, false);
    }
  }

  return hasSignals(profile) ? profile : null;
};

const scoreProduct = (product: Product, profile: TasteProfile) => {
  let score = profile.categories.get(String(product.categoryId)) ?? 0;

  score += profile.stores.get(String(product.storeId)) ?? 0;

  for (const tag of product.tags ?? []) {
    score += profile.tags.get(tag) ?? 0;
  }

  for (const optionId of optionIdsOf(product)) {
    score += profile.options.get(String(optionId)) ?? 0;
  }

  return score;
};

const sortProductsInMemory = (products: Product[], sort?: CatalogSort) => {
  if (!sort) {
    return products;
  }

  const spec = SORTS[sort];
  const entries = Object.entries(spec);

  return [...products].sort((left, right) => {
    for (const [field, direction] of entries) {
      const leftValue = field.split('.').reduce<unknown>((value, key) => {
        if (value && typeof value === 'object') {
          return (value as Record<string, unknown>)[key];
        }

        return undefined;
      }, left as unknown);
      const rightValue = field.split('.').reduce<unknown>((value, key) => {
        if (value && typeof value === 'object') {
          return (value as Record<string, unknown>)[key];
        }

        return undefined;
      }, right as unknown);

      if (leftValue === rightValue) {
        continue;
      }

      const leftNum = typeof leftValue === 'number' ? leftValue : 0;
      const rightNum = typeof rightValue === 'number' ? rightValue : 0;
      const cmp = leftNum > rightNum ? 1 : -1;

      return direction === -1 ? -cmp : cmp;
    }

    return 0;
  });
};

const listTrending = async (query: ListCatalogQuery) => {
  const result = await catalogService.list('trending', query);

  return {
    items: result.items,
    page: result.page,
    limit: result.limit,
    total: result.total,
    personalized: false,
  } satisfies RecommendedResult;
};

const listPersonalized = async (userId: string, query: ListCatalogQuery) => {
  const profile = await loadTasteProfile(userId);

  if (!profile) {
    return listTrending(query);
  }

  const topCategories = topKeys(profile.categories, RECOMMENDED_TOP_CATEGORIES);
  const topTags = topKeys(profile.tags, RECOMMENDED_TOP_TAGS);
  const baseFilter = await buildListingFilter(query);
  const excludeIds = [...profile.excludeProductIds].map((id) => new Types.ObjectId(id));
  const affinity: FilterQuery<Product>[] = [];

  if (topCategories.length > 0) {
    affinity.push({
      categoryId: { $in: topCategories.map((id) => new Types.ObjectId(id)) },
    });
  }

  if (topTags.length > 0) {
    affinity.push({ tags: { $in: topTags } });
  }

  if (affinity.length === 0) {
    return listTrending(query);
  }

  const filter: FilterQuery<Product> = {
    $and: [baseFilter, { _id: { $nin: excludeIds } }, { $or: affinity }],
  };

  const candidates = await ProductModel.find(filter).limit(RECOMMENDED_CANDIDATE_POOL * 2);
  const ranked = candidates
    .map((product) => ({
      product,
      score: scoreProduct(product, profile),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.product.ratingSummary?.average ?? 0) - (left.product.ratingSummary?.average ?? 0),
    );

  const chosen: Product[] = [];
  const seen = new Set<string>();

  for (const entry of ranked) {
    const id = String(entry.product._id);

    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    chosen.push(entry.product);

    if (chosen.length >= RECOMMENDED_CANDIDATE_POOL) {
      break;
    }
  }

  if (chosen.length < RECOMMENDED_CANDIDATE_POOL) {
    const fillerFilter: FilterQuery<Product> = {
      $and: [
        baseFilter,
        {
          _id: {
            $nin: [...excludeIds, ...chosen.map((product) => product._id)],
          },
        },
      ],
    };
    const filler = await ProductModel.find(fillerFilter)
      .sort({ 'metrics.trendingScore': -1, _id: 1 })
      .limit(RECOMMENDED_CANDIDATE_POOL - chosen.length);

    for (const product of filler) {
      const id = String(product._id);

      if (seen.has(id)) {
        continue;
      }

      seen.add(id);
      chosen.push(product);
    }
  }

  const ordered = query.sort ? sortProductsInMemory(chosen, query.sort) : chosen;
  const skip = (query.page - 1) * query.limit;
  const pageItems = ordered.slice(skip, skip + query.limit);

  return {
    items: await productService.presentMany(pageItems as HydratedDocument<Product>[]),
    page: query.page,
    limit: query.limit,
    total: ordered.length,
    personalized: true,
  } satisfies RecommendedResult;
};

export const recommendedService = {
  async list(userId: string | undefined, role: string | undefined, query: ListCatalogQuery) {
    if (userId && role === 'customer') {
      return listPersonalized(userId, query);
    }

    return listTrending(query);
  },
};
