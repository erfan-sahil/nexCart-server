import { createHash, randomBytes } from 'node:crypto';

import bcrypt from 'bcryptjs';
import type { Types } from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/database';
import { CategoryModel } from '../modules/categories/category.model';
import { ProductModel } from '../modules/products/product.model';
import { ProductVariantModel } from '../modules/products/product-variant.model';
import { StoreModel, listedStoreFilter } from '../modules/stores/store.model';
import { UserModel } from '../modules/users/user.model';
import { attributeService } from '../modules/attributes/attribute.service';
import { variantService } from '../modules/products/variant.service';
import {
  normalizeVariantAttributes,
  variantOptionKey,
} from '../modules/products/variant-attributes';
import { logger } from '../common/utils/logger';
import { featuresForProduct, productSeed, type ProductSeed } from './productSeed';
import { ensureVariantCatalog } from './seedVariantAttributes';
import { buildVariantAttributeInputs, variantsForProduct } from './variantSeed';

const DEMO_EMAIL = 'catalog@nexcart.local';
const DEMO_STORE_SLUG = 'nexcart-catalog';
const DAY_MS = 24 * 60 * 60 * 1000;
const TRENDING_SALE_WEIGHT = 5;

const imageIdFor = (slug: string) =>
  `img_${createHash('sha256').update(slug).digest('hex').slice(0, 24)}`;

const skuFor = (slug: string) => `NX-${slug}`.toUpperCase().slice(0, 40);

const dealWindow = () => ({
  dealStartsAt: new Date(Date.now() - DAY_MS),
  dealEndsAt: new Date(Date.now() + 14 * DAY_MS),
});

async function ensureStores() {
  const listed = await StoreModel.find(listedStoreFilter).select('_id');

  if (listed.length > 0) {
    return listed.map((store) => store._id);
  }

  let user = await UserModel.findOne({ email: DEMO_EMAIL });

  if (!user) {
    user = await UserModel.create({
      email: DEMO_EMAIL,
      passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
      firstName: 'NexCart',
      lastName: 'Catalog',
      role: 'vendor',
      status: 'active',
      emailVerifiedAt: new Date(),
    });
  }

  let store = await StoreModel.findOne({ userId: user._id });

  if (!store) {
    store = await StoreModel.create({
      userId: user._id,
      name: 'NexCart Catalog',
      slug: DEMO_STORE_SLUG,
      description: 'Sample store used for catalog products.',
      contact: { email: DEMO_EMAIL, phone: '' },
      address: {
        line1: '1 Market Street',
        city: 'Dhaka',
        country: 'Bangladesh',
      },
      ratingAverage: 4.7,
      ratingCount: 128,
      totalOrders: 640,
      totalSales: 48000,
      isActive: true,
      suspendedAt: null,
      joinedAt: new Date(),
    });
  } else {
    store.isActive = true;
    store.suspendedAt = null;
    await store.save();
  }

  return [store._id];
}

async function upsertProduct(
  item: ProductSeed,
  categoryId: Types.ObjectId,
  storeId: Types.ObjectId,
  publishedAt: Date,
) {
  const imageId = imageIdFor(item.slug);
  const image = {
    imageId,
    provider: 'local' as const,
    storageKey: `seed/products/${item.slug}`,
    url: item.image,
    mimeType: 'image/jpeg',
    size: 180000,
    alt: item.name,
    sortOrder: 0,
  };
  const features = featuresForProduct(item);
  const fields = {
    categoryId,
    name: item.name,
    shortDescription: item.shortDescription,
    description: features.length > 0 ? features.join('\n') : item.description,
    features,
    images: [image],
    thumbnailId: imageId,
    tags: item.tags,
    status: 'active' as const,
    approvalStatus: 'approved' as const,
    reviewNote: '',
    isFeatured: Boolean(item.isFeatured),
    isPublished: true,
    publishedAt,
    ratingSummary: {
      average: item.ratingAverage,
      count: item.ratingCount,
    },
    metrics: {
      unitsSold30d: item.unitsSold30d,
      unitsSold7d: item.unitsSold7d,
      views7d: item.views7d,
      trendingScore: item.unitsSold7d * TRENDING_SALE_WEIGHT + item.views7d,
    },
  };

  const existing = await ProductModel.findOne({ slug: item.slug });

  if (existing) {
    existing.set(fields);
    await existing.save();
    return existing;
  }

  return ProductModel.create({
    ...fields,
    storeId,
    slug: item.slug,
    attributes: [],
  });
}

async function syncProductVariants(
  productId: Types.ObjectId,
  categoryId: Types.ObjectId,
  item: ProductSeed,
  imageId: string,
) {
  const seeds = variantsForProduct(item);
  await ProductVariantModel.deleteMany({ productId });

  if (!seeds?.length) {
    await createVariantRow(productId, {
      sku: skuFor(item.slug),
      price: item.price,
      stock: item.stock,
      isDefault: true,
      discountPercent: item.discountPercent,
      attributes: [],
      optionKey: variantOptionKey([]),
      imageId,
    });
    return;
  }

  const assignments = await attributeService.listForCategory(String(categoryId));
  let defaultSet = false;

  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];

    if (!seed) {
      continue;
    }

    const inputs = buildVariantAttributeInputs(seed.options, assignments);
    const attributes = normalizeVariantAttributes(inputs, assignments);
    const isDefault = seed.isDefault === true || (!defaultSet && index === 0);

    if (isDefault) {
      defaultSet = true;
    }

    await createVariantRow(productId, {
      sku: seed.sku,
      price: seed.price,
      stock: seed.stock,
      isDefault,
      discountPercent: seed.discountPercent,
      attributes,
      optionKey: variantOptionKey(attributes),
      imageId,
    });
  }
}

async function createVariantRow(
  productId: Types.ObjectId,
  row: {
    sku: string;
    price: number;
    stock: number;
    isDefault: boolean;
    discountPercent?: number;
    attributes: ReturnType<typeof normalizeVariantAttributes>;
    optionKey: string;
    imageId: string;
  },
) {
  const discount = row.discountPercent
    ? {
        discountType: 'percent' as const,
        discountValue: row.discountPercent,
        ...dealWindow(),
      }
    : {
        discountType: null,
        discountValue: null,
        dealStartsAt: null,
        dealEndsAt: null,
      };

  await ProductVariantModel.create({
    productId,
    sku: row.sku.toUpperCase(),
    price: row.price,
    ...discount,
    stock: row.stock,
    imageId: row.imageId,
    attributes: row.attributes,
    optionKey: row.optionKey,
    status: 'active',
    isDefault: row.isDefault,
  });
}

async function syncStores(storeIds: Types.ObjectId[], categoryIds: Types.ObjectId[]) {
  const counts = await ProductModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    {
      $match: {
        storeId: { $in: storeIds },
        approvalStatus: 'approved',
        status: 'active',
        isPublished: true,
      },
    },
    { $group: { _id: '$storeId', count: { $sum: 1 } } },
  ]);

  await Promise.all(
    storeIds.map((storeId) => {
      const count = counts.find((row) => String(row._id) === String(storeId))?.count ?? 0;

      return StoreModel.updateOne(
        { _id: storeId },
        {
          $set: { totalProducts: count },
          $addToSet: { categoryIds: { $each: categoryIds } },
        },
      );
    }),
  );
}

async function seedProducts() {
  await connectDatabase();

  const storeIds = await ensureStores();
  const categories = await CategoryModel.find({
    slug: { $in: productSeed.map((item) => item.categorySlug) },
  }).select('_id slug');
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category._id]));
  const missing = productSeed
    .map((item) => item.categorySlug)
    .filter((slug) => !categoryBySlug.has(slug));

  if (missing.length > 0) {
    throw new Error(
      `Missing categories: ${[...new Set(missing)].join(', ')}. Run npm run seed:categories first.`,
    );
  }

  await ensureVariantCatalog();

  const now = Date.now();

  for (let index = 0; index < productSeed.length; index += 1) {
    const item = productSeed[index];

    if (!item) {
      continue;
    }

    const categoryId = categoryBySlug.get(item.categorySlug);

    if (!categoryId) {
      continue;
    }

    const storeId = storeIds[index % storeIds.length];

    if (!storeId) {
      throw new Error('No store is available for catalog products');
    }

    const product = await upsertProduct(item, categoryId, storeId, new Date(now - index * DAY_MS));

    await syncProductVariants(product._id, categoryId, item, imageIdFor(item.slug));
  }

  await variantService.rebuildListings();
  await syncStores(storeIds, [...categoryBySlug.values()]);

  const total = await ProductModel.countDocuments({
    slug: { $in: productSeed.map((item) => item.slug) },
  });
  const multiVariantProducts = await ProductVariantModel.aggregate<{ count: number }>([
    { $group: { _id: '$productId', variants: { $sum: 1 } } },
    { $match: { variants: { $gt: 1 } } },
    { $count: 'count' },
  ]);
  logger.info('Product seed complete', {
    total,
    multiVariantProducts: multiVariantProducts[0]?.count ?? 0,
    variants: await ProductVariantModel.countDocuments(),
  });
  await disconnectDatabase();
}

seedProducts().catch(async (error: unknown) => {
  logger.error('Product seed failed', { err: error });
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
