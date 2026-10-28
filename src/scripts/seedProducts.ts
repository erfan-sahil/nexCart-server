import { createHash, randomBytes } from 'node:crypto';

import bcrypt from 'bcryptjs';
import type { Types } from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/database';
import { CategoryModel } from '../models/category.model';
import { ProductModel } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { StoreModel, listedStoreFilter } from '../models/store.model';
import { UserModel } from '../models/user.model';
import { variantService } from '../services/variant.service';
import { variantOptionKey } from '../services/variantAttributes';
import { logger } from '../utils/logger';
import { productSeed, type ProductSeed } from './productSeed';

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
  const fields = {
    categoryId,
    name: item.name,
    shortDescription: item.shortDescription,
    description: item.description,
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

async function upsertVariant(productId: Types.ObjectId, item: ProductSeed, imageId: string) {
  const discount = item.discountPercent
    ? {
        discountType: 'percent' as const,
        discountValue: item.discountPercent,
        ...dealWindow(),
      }
    : {
        discountType: null,
        discountValue: null,
        dealStartsAt: null,
        dealEndsAt: null,
      };
  const sku = skuFor(item.slug);
  const payload = {
    productId,
    sku,
    price: item.price,
    ...discount,
    stock: item.stock,
    imageId,
    attributes: [],
    optionKey: variantOptionKey([]),
    status: 'active' as const,
    isDefault: true,
  };

  const current =
    (await ProductVariantModel.findOne({ productId, isDefault: true })) ??
    (await ProductVariantModel.findOne({ sku }));

  if (current && String(current.productId) !== String(productId)) {
    throw new Error(`SKU ${sku} already belongs to another product`);
  }

  if (current) {
    current.set(payload);
    await current.save();
    return;
  }

  await ProductVariantModel.create(payload);
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

    await upsertVariant(product._id, item, imageIdFor(item.slug));
  }

  await variantService.rebuildListings();
  await syncStores(storeIds, [...categoryBySlug.values()]);

  const total = await ProductModel.countDocuments({
    slug: { $in: productSeed.map((item) => item.slug) },
  });
  logger.info('Product seed complete', { total });
  await disconnectDatabase();
}

seedProducts().catch(async (error: unknown) => {
  logger.error('Product seed failed', { err: error });
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
