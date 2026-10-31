import { Types, type FilterQuery, type SortOrder } from 'mongoose';
import {
  CATALOG_COLLECTIONS,
  HOME_SECTION_LIMITS,
  RELATED_CANDIDATE_LIMIT,
  RESERVED_CATALOG_COLLECTIONS,
} from './constants';
import { CategoryModel } from '../categories/category.model';
import { ProductModel, type Product } from '../products/product.model';
import { StoreModel, isStoreListed, listedStoreFilter } from '../stores/store.model';
import type { CatalogCollection, CatalogCollectionParam, CatalogHomeDto } from './types';
import { AppError } from '../../common/errors/AppError';
import { escapeRegex } from '../../common/utils/slugify';
import { productService } from '../products/product.service';
import { storeService } from '../stores/store.service';
import { variantService } from '../products/variant.service';
import type { ListCatalogQuery } from './catalog.validator';
import { flashDealService } from '../flash-deals/flash-deal.service';
import { sponsoredPlacementService } from '../sponsored-placements/sponsored-placement.service';

type CatalogSort = NonNullable<ListCatalogQuery['sort']>;

const RESERVED = new Set<string>(RESERVED_CATALOG_COLLECTIONS);

const DEFAULT_SORTS: Record<CatalogCollection, Record<string, SortOrder>> = {
  'flash-deals': { 'listing.dealEndsAt': 1, 'listing.dealSavings': -1, _id: 1 },
  bestsellers: { 'metrics.unitsSold30d': -1, _id: 1 },
  trending: { 'metrics.trendingScore': -1, _id: 1 },
  'new-arrivals': { publishedAt: -1, _id: 1 },
};

const SORTS: Record<CatalogSort, Record<string, SortOrder>> = {
  newest: { publishedAt: -1, _id: 1 },
  bestsellers: { 'metrics.unitsSold30d': -1, _id: 1 },
  'price-asc': { 'listing.minPrice': 1, _id: 1 },
  'price-desc': { 'listing.minPrice': -1, _id: 1 },
  rating: { 'ratingSummary.average': -1, _id: 1 },
  featured: { isFeatured: -1, publishedAt: -1, _id: 1 },
};

let catalogReady: Promise<void> | null = null;

const ensureCatalogData = () => {
  catalogReady ??= ProductModel.updateMany(
    {
      approvalStatus: 'approved',
      status: 'active',
      isPublished: true,
      $or: [{ publishedAt: null }, { publishedAt: { $exists: false } }],
    },
    [{ $set: { publishedAt: '$createdAt' } }],
  )
    .then(() => variantService.rebuildListings())
    .catch((error: unknown) => {
      catalogReady = null;
      throw error;
    });

  return catalogReady;
};

const isCatalogCollection = (value: string): value is CatalogCollection =>
  (CATALOG_COLLECTIONS as readonly string[]).includes(value);

const listedStoreIds = () => StoreModel.find(listedStoreFilter).distinct('_id');

const customerGate = async (): Promise<FilterQuery<Product>> => ({
  approvalStatus: 'approved',
  status: 'active',
  isPublished: true,
  'listing.hasStock': true,
  storeId: { $in: await listedStoreIds() },
});

const membership = (collection: CatalogCollection, _now: Date): FilterQuery<Product> => {
  if (collection === 'flash-deals') {
    return {};
  }

  if (collection === 'bestsellers') {
    return { 'metrics.unitsSold30d': { $gt: 0 } };
  }

  if (collection === 'trending') {
    return {
      $or: [{ 'metrics.unitsSold7d': { $gt: 0 } }, { 'metrics.views7d': { $gt: 0 } }],
    };
  }

  return { publishedAt: { $ne: null } };
};

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

const buildFilter = async (collection: CatalogCollection, query: ListCatalogQuery) => {
  const clauses: FilterQuery<Product>[] = [
    await customerGate(),
    membership(collection, new Date()),
  ];
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

const listFlashDealsCollection = async (query: ListCatalogQuery) => {
  const now = new Date();
  const deals = await flashDealService.listActiveProductIds(now);

  if (deals.length === 0) {
    return {
      items: [],
      page: query.page,
      limit: query.limit,
      total: 0,
      endsAt: null,
    };
  }

  const dealsByProduct = new Map(deals.map((deal) => [deal.productId, deal]));
  const gate = await customerGate();
  const products = await ProductModel.find({
    ...gate,
    _id: { $in: deals.map((deal) => deal.productId) },
  });

  const scored = await Promise.all(
    products.map(async (product) => {
      const deal = dealsByProduct.get(String(product._id));

      if (!deal) {
        return null;
      }

      const savings = await flashDealService.maxSavingsForProduct(String(product._id), {
        discountType: deal.discountType,
        discountValue: deal.discountValue,
      });

      return {
        product,
        endsAt: deal.endsAt,
        savings,
      };
    }),
  );

  const eligible = scored
    .filter((row): row is NonNullable<typeof row> => row !== null && row.savings > 0)
    .sort(
      (left, right) =>
        left.endsAt.getTime() - right.endsAt.getTime() || right.savings - left.savings,
    );

  const total = eligible.length;
  const skip = (query.page - 1) * query.limit;
  const pageRows = eligible.slice(skip, skip + query.limit);
  const presented = await productService.presentMany(pageRows.map((row) => row.product));
  const endsAt = eligible.length > 0 ? eligible[0]!.endsAt.toISOString() : null;

  return {
    items: presented,
    page: query.page,
    limit: query.limit,
    total,
    endsAt,
  };
};

const listCollectionExcluding = async (
  collection: CatalogCollection,
  query: ListCatalogQuery,
  excludeProductId?: string,
) => {
  if (!excludeProductId) {
    return listCollection(collection, query);
  }

  const target = query.limit;
  const collected: Awaited<ReturnType<typeof listCollection>>['items'] = [];
  let page = query.page;
  let total = 0;

  while (collected.length < target && page <= 10) {
    const batch = await listCollection(collection, { ...query, page, limit: target + 4 });

    total = batch.total;

    for (const item of batch.items) {
      if (item.id === excludeProductId) {
        continue;
      }

      if (collected.some((existing) => existing.id === item.id)) {
        continue;
      }

      collected.push(item);

      if (collected.length >= target) {
        break;
      }
    }

    if (batch.items.length === 0) {
      break;
    }

    page += 1;
  }

  return {
    items: collected.slice(0, target),
    page: query.page,
    limit: query.limit,
    total,
    endsAt: null,
  };
};

const listCollection = async (collection: CatalogCollection, query: ListCatalogQuery) => {
  if (collection === 'flash-deals') {
    return listFlashDealsCollection(query);
  }

  const filter = await buildFilter(collection, query);
  const sort = query.sort ? SORTS[query.sort] : DEFAULT_SORTS[collection];
  const skip = (query.page - 1) * query.limit;
  const [products, total] = await Promise.all([
    ProductModel.find(filter).sort(sort).skip(skip).limit(query.limit),
    ProductModel.countDocuments(filter),
  ]);

  return {
    items: await productService.presentMany(products),
    page: query.page,
    limit: query.limit,
    total,
    endsAt: null,
  };
};

const optionIdsOf = (product: Product) =>
  (product.attributes ?? []).flatMap((attribute) => attribute.optionIds ?? []);

const scoreRelated = (product: Product, tags: Set<string>, optionIds: Set<string>) => {
  let score = 0;

  for (const tag of product.tags ?? []) {
    if (tags.has(tag)) {
      score += 2;
    }
  }

  for (const optionId of optionIdsOf(product)) {
    if (optionIds.has(String(optionId))) {
      score += 3;
    }
  }

  return score;
};

export const catalogService = {
  async home(): Promise<CatalogHomeDto> {
    await ensureCatalogData();

    const exclusions = await sponsoredPlacementService.sectionExclusions();

    const [flashMeta, flashDeals, topSelling, popularStores, trending, newArrivals] =
      await Promise.all([
        flashDealService.getPublicMeta(),
        listFlashDealsCollection({ page: 1, limit: HOME_SECTION_LIMITS.flashDeals }),
        listCollectionExcluding(
          'bestsellers',
          { page: 1, limit: HOME_SECTION_LIMITS.topSelling },
          exclusions.get('top-selling'),
        ),
        storeService.listPublic({
          page: 1,
          limit: HOME_SECTION_LIMITS.popularStores,
          sort: 'popular',
        }),
        listCollectionExcluding('trending', { page: 1, limit: HOME_SECTION_LIMITS.trending }),
        listCollectionExcluding(
          'new-arrivals',
          { page: 1, limit: HOME_SECTION_LIMITS.newArrivals },
          exclusions.get('new-arrivals'),
        ),
      ]);

    return {
      flashDeals: {
        sectionTitle: flashMeta.sectionTitle,
        endsAt: flashDeals.endsAt ?? flashMeta.endsAt,
        items: flashDeals.items,
      },
      topSelling: { items: topSelling.items },
      popularStores: { items: popularStores.items },
      trending: { items: trending.items },
      newArrivals: { items: newArrivals.items },
    };
  },

  async list(collection: CatalogCollectionParam, query: ListCatalogQuery) {
    if (RESERVED.has(collection) || !isCatalogCollection(collection)) {
      throw AppError.validation('This collection is not available yet', [
        { path: 'collection', message: 'This collection is not available yet' },
      ]);
    }

    await ensureCatalogData();

    const result = await listCollection(collection, query);

    if (collection === 'flash-deals') {
      const meta = await flashDealService.getPublicMeta();

      return {
        items: result.items,
        page: result.page,
        limit: result.limit,
        total: result.total,
        endsAt: result.endsAt ?? meta.endsAt,
        sectionTitle: meta.sectionTitle,
      };
    }

    return {
      items: result.items,
      page: result.page,
      limit: result.limit,
      total: result.total,
    };
  },

  async related(slug: string, limit: number) {
    await ensureCatalogData();

    const product = await ProductModel.findOne({ slug });

    if (!product) {
      throw AppError.notFound('Product not found');
    }

    const store = await StoreModel.findById(product.storeId).select('isActive suspendedAt');
    const visible =
      product.approvalStatus === 'approved' &&
      product.status === 'active' &&
      product.isPublished &&
      isStoreListed(store);

    if (!visible) {
      throw AppError.notFound('Product not found');
    }

    const gate = await customerGate();
    const sameCategory: FilterQuery<Product> = {
      ...gate,
      _id: { $ne: product._id },
      categoryId: product.categoryId,
    };
    const tags = [...(product.tags ?? [])];
    const optionIds = optionIdsOf(product);
    const [categoryProducts, tagProducts, optionProducts] = await Promise.all([
      ProductModel.find(sameCategory).sort({ publishedAt: -1 }).limit(RELATED_CANDIDATE_LIMIT),
      tags.length > 0
        ? ProductModel.find({ ...sameCategory, tags: { $in: tags } }).limit(RELATED_CANDIDATE_LIMIT)
        : Promise.resolve([]),
      optionIds.length > 0
        ? ProductModel.find({
            ...sameCategory,
            'attributes.optionIds': { $in: optionIds },
          }).limit(RELATED_CANDIDATE_LIMIT)
        : Promise.resolve([]),
    ]);
    const tagSet = new Set(tags);
    const optionSet = new Set(optionIds.map((optionId) => String(optionId)));
    const ranked = new Map<string, { product: (typeof categoryProducts)[number]; score: number }>();

    for (const candidate of [...optionProducts, ...tagProducts, ...categoryProducts]) {
      const id = String(candidate._id);

      if (ranked.has(id)) {
        continue;
      }

      ranked.set(id, {
        product: candidate,
        score: scoreRelated(candidate, tagSet, optionSet),
      });
    }

    const chosen = [...ranked.values()]
      .sort(
        (left, right) =>
          right.score - left.score ||
          (right.product.ratingSummary?.average ?? 0) - (left.product.ratingSummary?.average ?? 0),
      )
      .slice(0, limit)
      .map((entry) => entry.product);
    const exclude = new Set([String(product._id), ...chosen.map((item) => String(item._id))]);

    if (chosen.length < limit) {
      const filler = await ProductModel.find({
        approvalStatus: 'approved',
        status: 'active',
        isPublished: true,
        'listing.hasStock': true,
        storeId: product.storeId,
        _id: { $nin: [...exclude].map((id) => new Types.ObjectId(id)) },
      })
        .sort({ publishedAt: -1 })
        .limit(limit - chosen.length);

      chosen.push(...filler);
    }

    return productService.presentMany(chosen);
  },
};
