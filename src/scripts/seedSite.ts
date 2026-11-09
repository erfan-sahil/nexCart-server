import type { Types } from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../common/utils/logger';
import { CatalogSignalModel } from '../modules/catalog/catalog-signal.model';
import { CategoryModel } from '../modules/categories/category.model';
import { CouponModel } from '../modules/coupons/coupon.model';
import {
  FlashDealCampaignModel,
  FlashDealItemModel,
  FlashDealSettingsModel,
} from '../modules/flash-deals/flash-deal.model';
import { FLASH_DEAL_SETTINGS_KEY } from '../modules/flash-deals/constants';
import { vendorUnitPrice } from '../modules/flash-deals/flash-deal-pricing';
import { HERO_KEY } from '../modules/hero/constants';
import { HeroModel } from '../modules/hero/hero.model';
import { OrderModel } from '../modules/orders/order.model';
import { VendorOrderModel } from '../modules/orders/vendor-order.model';
import { ProductModel } from '../modules/products/product.model';
import { ProductVariantModel } from '../modules/products/product-variant.model';
import { variantService } from '../modules/products/variant.service';
import { RecentlyViewedItemModel } from '../modules/recently-viewed/recently-viewed-item.model';
import { ReviewModel } from '../modules/reviews/review.model';
import { SITE_SETTINGS_KEY } from '../modules/site-settings/constants';
import { SiteSettingsModel } from '../modules/site-settings/site-settings.model';
import { SponsoredPlacementModel } from '../modules/sponsored-placements/sponsored-placement.model';
import { StoreModel } from '../modules/stores/store.model';
import { UserModel } from '../modules/users/user.model';
import { productSeed, type ProductSeed } from './productSeed';
import {
  assertSeedingAllowed,
  describeMongoTarget,
  ensureUser,
  flushPublicCaches,
} from './seedUtils';
import {
  FLASH_SECTION_TITLE,
  couponSeed,
  couponWindow,
  createRng,
  customerSeed,
  DEMO_EMAIL_DOMAIN,
  DEMO_PASSWORD,
  featuredRootSlugs,
  flashCampaignSeed,
  flashWindow,
  heroSeed,
  reviewBodies,
  rootSlugOf,
  siteSettingsSeed,
  sponsoredSeed,
  vendorReplies,
} from './siteSeed';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const ORDER_KEY_PREFIX = 'seed-order-';
const ORDER_COUNT = 48;
const ORDER_WINDOW_DAYS = 75;
const REVIEW_WINDOW_DAYS = 120;
const COMMISSION_RATE = siteSettingsSeed.defaultCommissionRate;

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

type Rng = () => number;

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;

const shuffled = <T>(rng: Rng, items: readonly T[]) =>
  items
    .map((item) => ({ item, key: rng() }))
    .sort((left, right) => left.key - right.key)
    .map((entry) => entry.item);

/** Splits `total` into at most `parts` positive integers that sum to `total`. */
const splitUnits = (rng: Rng, total: number, parts: number) => {
  const count = Math.max(1, Math.min(parts, total));
  const weights = Array.from({ length: count }, () => 0.4 + rng());
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const result = weights.map((weight) => Math.max(1, Math.floor((weight / weightSum) * total)));
  const drift = total - result.reduce((sum, value) => sum + value, 0);

  result[0] = Math.max(1, result[0]! + drift);

  return result;
};

type SeedProduct = {
  id: Types.ObjectId;
  storeId: Types.ObjectId;
  seed: ProductSeed;
  name: string;
  rootSlug: string;
};

type SeedUser = {
  id: Types.ObjectId;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  state: string;
  postalCode: string;
  isMock: boolean;
};

/* -------------------------------------------------------------------------- */
/* Loaders                                                                    */
/* -------------------------------------------------------------------------- */

async function loadSeedProducts(): Promise<SeedProduct[]> {
  const rows = await ProductModel.find({ slug: { $in: productSeed.map((item) => item.slug) } })
    .select('_id slug name storeId')
    .lean();

  if (rows.length === 0) {
    throw new Error('No seeded products found. Run `npm run seed:products` first.');
  }

  const bySlug = new Map(rows.map((row) => [row.slug, row]));

  return productSeed.flatMap((seed) => {
    const row = bySlug.get(seed.slug);

    return row
      ? [
          {
            id: row._id,
            storeId: row.storeId,
            seed,
            name: row.name,
            rootSlug: rootSlugOf(seed.categorySlug) ?? '',
          },
        ]
      : [];
  });
}

async function loadCustomers(): Promise<SeedUser[]> {
  const mock: SeedUser[] = [];

  for (const item of customerSeed) {
    const user = await ensureUser({
      email: item.email,
      firstName: item.firstName,
      lastName: item.lastName,
      phone: item.phone,
      role: 'customer',
    });

    mock.push({
      id: user._id,
      firstName: item.firstName,
      lastName: item.lastName,
      phone: item.phone,
      city: item.city,
      state: item.state,
      postalCode: item.postalCode,
      isMock: true,
    });
  }

  // Real accounts created through the app also get browsing history and orders.
  const real = await UserModel.find({
    role: 'customer',
    status: 'active',
    email: { $not: new RegExp(`@${DEMO_EMAIL_DOMAIN.replace('.', '\\.')}$`) },
  })
    .select('firstName lastName phone')
    .lean();

  return [
    ...mock,
    ...real.map((user) => ({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? '+8801712345678',
      city: 'Dhaka',
      state: 'Dhaka',
      postalCode: '1212',
      isMock: false,
    })),
  ];
}

async function loadUnitPrices(productIds: Types.ObjectId[]) {
  const variants = await ProductVariantModel.find({
    productId: { $in: productIds },
    status: 'active',
    stock: { $gt: 0 },
  })
    .select('productId sku price discountType discountValue isDefault')
    .lean();
  const byProduct = new Map<
    string,
    { variantId: Types.ObjectId; sku: string; unitPrice: number }
  >();

  for (const variant of [...variants].sort((a, b) => Number(a.isDefault) - Number(b.isDefault))) {
    // Default variants are written last so they win.
    byProduct.set(String(variant.productId), {
      variantId: variant._id,
      sku: variant.sku,
      unitPrice: vendorUnitPrice(
        variant.price,
        variant.discountType === 'percent' || variant.discountType === 'amount'
          ? variant.discountType
          : null,
        variant.discountValue ?? null,
      ),
    });
  }

  return byProduct;
}

/* -------------------------------------------------------------------------- */
/* Site content                                                               */
/* -------------------------------------------------------------------------- */

async function seedHero() {
  await HeroModel.findOneAndUpdate(
    { key: HERO_KEY },
    { $set: { slides: heroSeed }, $setOnInsert: { key: HERO_KEY } },
    { upsert: true, runValidators: true },
  );

  return heroSeed.length;
}

async function seedSiteSettings() {
  await SiteSettingsModel.findOneAndUpdate(
    { key: SITE_SETTINGS_KEY },
    { $set: siteSettingsSeed, $setOnInsert: { key: SITE_SETTINGS_KEY } },
    { upsert: true, runValidators: true },
  );
}

async function seedFeaturedCategories() {
  const operations = featuredRootSlugs.map((slug, index) => ({
    updateOne: {
      filter: { slug, level: 1 },
      update: { $set: { isFeatured: true, featuredOrder: index, isActive: true } },
    },
  }));
  const result = await CategoryModel.bulkWrite(operations);

  return result.modifiedCount + result.matchedCount > 0 ? featuredRootSlugs.length : 0;
}

async function seedCoupons() {
  const now = Date.now();

  for (const coupon of couponSeed) {
    const { startsAt, endsAt } = couponWindow(coupon, now);

    await CouponModel.findOneAndUpdate(
      { code: coupon.code },
      {
        $set: {
          label: coupon.label,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          minimumSubtotal: coupon.minimumSubtotal,
          startsAt,
          endsAt,
          usageLimit: coupon.usageLimit,
          perCustomerLimit: coupon.perCustomerLimit,
          usedCount: coupon.usedCount,
          isEnabled: coupon.isEnabled,
        },
        $setOnInsert: { code: coupon.code },
      },
      { upsert: true, runValidators: true },
    );
  }

  return couponSeed.length;
}

async function seedFlashDeals(products: SeedProduct[]) {
  const productBySlug = new Map(products.map((product) => [product.seed.slug, product]));
  const now = Date.now();
  let itemCount = 0;

  await FlashDealSettingsModel.findOneAndUpdate(
    { key: FLASH_DEAL_SETTINGS_KEY },
    {
      $set: { sectionTitle: FLASH_SECTION_TITLE },
      $setOnInsert: { key: FLASH_DEAL_SETTINGS_KEY },
    },
    { upsert: true, runValidators: true },
  );

  for (const campaign of flashCampaignSeed) {
    const { startsAt, endsAt } = flashWindow(campaign, now);
    const saved = await FlashDealCampaignModel.findOneAndUpdate(
      { name: campaign.name },
      { $set: { startsAt, endsAt, isEnabled: campaign.isEnabled } },
      { upsert: true, new: true, runValidators: true },
    );

    const items = campaign.items.flatMap(({ slug, percent }) => {
      const product = productBySlug.get(slug);

      return product
        ? [
            {
              campaignId: saved._id,
              productId: product.id,
              discountType: 'percent' as const,
              discountValue: percent,
            },
          ]
        : [];
    });

    await FlashDealItemModel.deleteMany({ campaignId: saved._id });
    await FlashDealItemModel.insertMany(items);
    itemCount += items.length;
  }

  return { campaigns: flashCampaignSeed.length, items: itemCount };
}

async function seedSponsored(products: SeedProduct[]) {
  const productBySlug = new Map(products.map((product) => [product.seed.slug, product]));
  let count = 0;

  for (const placement of sponsoredSeed) {
    const product = productBySlug.get(placement.productSlug);

    if (!product) {
      continue;
    }

    await SponsoredPlacementModel.findOneAndUpdate(
      { slot: placement.slot },
      {
        $set: {
          productId: product.id,
          section: placement.section,
          title: placement.title,
          subtitle: placement.subtitle,
          ctaLabel: placement.ctaLabel,
          isActive: true,
        },
        $setOnInsert: { slot: placement.slot },
      },
      { upsert: true, runValidators: true },
    );
    count += 1;
  }

  return count;
}

/* -------------------------------------------------------------------------- */
/* Catalog activity                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Backs the seeded product metrics with real signal rows. Without them, the first live sale or
 * view would recompute metrics from an empty signal table and wipe every bestseller ranking.
 */
async function seedCatalogSignals(
  products: SeedProduct[],
  prices: Map<string, { unitPrice: number }>,
) {
  await CatalogSignalModel.deleteMany({
    productId: { $in: products.map((product) => product.id) },
  });

  const now = Date.now();
  const rows: Array<{
    productId: Types.ObjectId;
    storeId: Types.ObjectId;
    kind: 'sale' | 'view';
    units: number;
    amount: number;
    occurredAt: Date;
  }> = [];
  const storeTotals = new Map<string, { sales: number; orders: number }>();

  for (const product of products) {
    const rng = createRng(`signals:${product.seed.slug}`);
    const unitPrice = prices.get(String(product.id))?.unitPrice ?? product.seed.price;
    const recent = product.seed.unitsSold7d;
    const older = Math.max(0, product.seed.unitsSold30d - recent);
    const at = (minDay: number, maxDay: number) =>
      new Date(now - (minDay + rng() * (maxDay - minDay)) * DAY_MS);
    const sale = (units: number, minDay: number, maxDay: number) =>
      rows.push({
        productId: product.id,
        storeId: product.storeId,
        kind: 'sale',
        units,
        amount: money(units * unitPrice),
        occurredAt: at(minDay, maxDay),
      });

    if (recent > 0) {
      splitUnits(rng, recent, 3).forEach((units) => sale(units, 0.05, 6.9));
    }

    if (older > 0) {
      splitUnits(rng, older, 4).forEach((units) => sale(units, 7.1, 29.5));
    }

    if (product.seed.views7d > 0) {
      splitUnits(rng, product.seed.views7d, 5).forEach((units) =>
        rows.push({
          productId: product.id,
          storeId: product.storeId,
          kind: 'view',
          units,
          amount: 0,
          occurredAt: at(0.05, 6.9),
        }),
      );
    }

    const totals = storeTotals.get(String(product.storeId)) ?? { sales: 0, orders: 0 };

    // Lifetime figures: roughly four 30-day windows of the recent run rate.
    totals.sales += money(product.seed.unitsSold30d * unitPrice * 4);
    totals.orders += Math.round(product.seed.unitsSold30d * 2.4);
    storeTotals.set(String(product.storeId), totals);
  }

  await CatalogSignalModel.insertMany(rows);

  await Promise.all(
    [...storeTotals.entries()].map(([storeId, totals]) =>
      StoreModel.updateOne(
        { _id: storeId },
        { $set: { totalSales: money(totals.sales), totalOrders: totals.orders } },
      ),
    ),
  );

  return rows.length;
}

/* -------------------------------------------------------------------------- */
/* Reviews                                                                    */
/* -------------------------------------------------------------------------- */

const clampRating = (value: number) =>
  Math.min(5, Math.max(1, Math.round(value))) as 1 | 2 | 3 | 4 | 5;

async function seedReviews(products: SeedProduct[], customers: SeedUser[]) {
  const mockCustomers = customers.filter((customer) => customer.isMock);
  const stores = await StoreModel.find({ _id: { $in: products.map((product) => product.storeId) } })
    .select('_id userId')
    .lean();
  const vendorByStore = new Map(stores.map((store) => [String(store._id), store.userId]));

  await ReviewModel.deleteMany({
    authorId: { $in: [...mockCustomers.map((customer) => customer.id), ...vendorByStore.values()] },
  });

  const now = Date.now();
  const topLevel = products.flatMap((product) => {
    const rng = createRng(`reviews:${product.seed.slug}`);
    const authors = shuffled(rng, mockCustomers).slice(0, 3 + Math.floor(rng() * 7));

    return authors.map((author) => {
      const rating = clampRating(product.seed.ratingAverage + (rng() - 0.55) * 2.4);
      const body = pick(rng, reviewBodies[rating]).replace('{product}', product.name);
      const createdAt = new Date(now - (0.5 + rng() * REVIEW_WINDOW_DAYS) * DAY_MS);

      return {
        productId: product.id,
        storeId: product.storeId,
        authorId: author.id,
        parentId: null,
        rating,
        body,
        createdAt,
        updatedAt: createdAt,
      };
    });
  });

  const inserted = await ReviewModel.insertMany(
    topLevel.map(({ storeId: _storeId, ...review }) => review),
  );

  const replies = inserted.flatMap((review, index) => {
    const source = topLevel[index];
    const vendorId = source ? vendorByStore.get(String(source.storeId)) : undefined;

    if (!source || !vendorId) {
      return [];
    }

    const rng = createRng(`reply:${String(source.productId)}:${String(source.authorId)}`);

    if (source.rating > 3 && rng() > 0.3) {
      return [];
    }

    const createdAt = new Date(source.createdAt.getTime() + (2 + rng() * 40) * HOUR_MS);

    return [
      {
        productId: source.productId,
        authorId: vendorId,
        parentId: review._id,
        rating: null,
        body: source.rating <= 3 ? vendorReplies[2]! : pick(rng, vendorReplies),
        createdAt,
        updatedAt: createdAt,
      },
    ];
  });

  await ReviewModel.insertMany(replies);
  await syncRatingSummaries(products);

  return { reviews: inserted.length, replies: replies.length };
}

/** Recomputes product and store ratings from the review rows so every number on the site agrees. */
async function syncRatingSummaries(products: SeedProduct[]) {
  const rows = await ReviewModel.aggregate<{
    _id: Types.ObjectId;
    count: number;
    sum: number;
    star1: number;
    star2: number;
    star3: number;
    star4: number;
    star5: number;
  }>([
    { $match: { productId: { $in: products.map((product) => product.id) }, parentId: null } },
    {
      $group: {
        _id: '$productId',
        count: { $sum: 1 },
        sum: { $sum: '$rating' },
        star1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        star2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        star3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        star4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        star5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
      },
    },
  ]);
  const storeStats = new Map<string, { count: number; sum: number }>();
  const storeByProduct = new Map(products.map((product) => [String(product.id), product.storeId]));

  await ProductModel.bulkWrite(
    rows.map((row) => ({
      updateOne: {
        filter: { _id: row._id },
        update: {
          $set: {
            ratingSummary: {
              average: money(row.sum / row.count),
              count: row.count,
              distribution: {
                star1: row.star1,
                star2: row.star2,
                star3: row.star3,
                star4: row.star4,
                star5: row.star5,
              },
            },
          },
        },
      },
    })),
  );

  for (const row of rows) {
    const storeId = String(storeByProduct.get(String(row._id)));
    const stats = storeStats.get(storeId) ?? { count: 0, sum: 0 };

    stats.count += row.count;
    stats.sum += row.sum;
    storeStats.set(storeId, stats);
  }

  await Promise.all(
    [...storeStats.entries()].map(([storeId, stats]) =>
      StoreModel.updateOne(
        { _id: storeId },
        { $set: { ratingAverage: money(stats.sum / stats.count), ratingCount: stats.count } },
      ),
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Shopper behaviour                                                          */
/* -------------------------------------------------------------------------- */

/** Picks products biased toward the shopper's two favourite departments. */
const pickProducts = (rng: Rng, products: SeedProduct[], tasteRoots: string[], count: number) => {
  const liked = products.filter((product) => tasteRoots.includes(product.rootSlug));
  const chosen = new Map<string, SeedProduct>();

  for (const candidate of shuffled(rng, [...liked, ...shuffled(rng, products)])) {
    if (chosen.size >= count) {
      break;
    }

    if (!chosen.has(String(candidate.id)) && (liked.includes(candidate) || rng() > 0.55)) {
      chosen.set(String(candidate.id), candidate);
    }
  }

  return [...chosen.values()];
};

const tasteFor = (rng: Rng) => shuffled(rng, featuredRootSlugs).slice(0, 2);

async function seedRecentlyViewed(products: SeedProduct[], customers: SeedUser[]) {
  const now = Date.now();
  const recentOps: Parameters<typeof RecentlyViewedItemModel.bulkWrite>[0] = [];

  for (const customer of customers) {
    const rng = createRng(`behaviour:${String(customer.id)}`);
    const taste = tasteFor(rng);

    pickProducts(rng, products, taste, 8 + Math.floor(rng() * 5)).forEach((product, index) => {
      recentOps.push({
        updateOne: {
          filter: { userId: customer.id, productId: product.id },
          update: {
            $set: { viewedAt: new Date(now - (index * 5 + rng() * 4) * HOUR_MS) },
            $setOnInsert: { userId: customer.id, productId: product.id },
          },
          upsert: true,
        },
      });
    });
  }

  await RecentlyViewedItemModel.bulkWrite(recentOps);

  return recentOps.length;
}

/* -------------------------------------------------------------------------- */
/* Orders                                                                     */
/* -------------------------------------------------------------------------- */

type OrderLifecycle = 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

const lifecycleFor = (rng: Rng, ageDays: number): OrderLifecycle => {
  const roll = rng();

  if (ageDays < 3) {
    return 'confirmed';
  }

  if (ageDays < 10) {
    return roll < 0.5 ? 'shipped' : 'confirmed';
  }

  return roll < 0.86 ? 'delivered' : 'cancelled';
};

const vendorStatusFor = (lifecycle: OrderLifecycle, ageDays: number) => {
  if (lifecycle === 'confirmed') {
    return ageDays < 1 ? ('pending' as const) : ('accepted' as const);
  }

  return lifecycle;
};

const orderNumberFor = (index: number, createdAt: Date) =>
  `NC${createdAt.toISOString().slice(0, 10).replace(/-/g, '')}${(0xa00000 + index)
    .toString(16)
    .toUpperCase()}`;

async function clearSeedOrders() {
  const existing = await OrderModel.find({ idempotencyKey: { $regex: `^${ORDER_KEY_PREFIX}` } })
    .select('_id')
    .lean();
  const ids = existing.map((order) => order._id);

  if (ids.length === 0) {
    return;
  }

  await VendorOrderModel.deleteMany({ parentOrderId: { $in: ids } });
  await OrderModel.deleteMany({ _id: { $in: ids } });
}

async function seedOrders(
  products: SeedProduct[],
  customers: SeedUser[],
  prices: Map<string, { variantId: Types.ObjectId; sku: string; unitPrice: number }>,
) {
  await clearSeedOrders();

  const sellable = products.filter((product) => prices.has(String(product.id)));
  const stores = await StoreModel.find({ _id: { $in: sellable.map((product) => product.storeId) } })
    .select('_id name userId')
    .lean();
  const storeById = new Map(stores.map((store) => [String(store._id), store]));
  const welcome = await CouponModel.findOne({ code: 'WELCOME10' }).select('_id').lean();
  const now = Date.now();
  let vendorOrderCount = 0;

  for (let index = 0; index < ORDER_COUNT; index += 1) {
    const rng = createRng(`order:${index}`);
    const customer = pick(rng, customers);
    const ageDays = (index / ORDER_COUNT) * ORDER_WINDOW_DAYS + rng() * 1.2;
    const createdAt = new Date(now - ageDays * DAY_MS);
    const lifecycle = lifecycleFor(rng, ageDays);
    const isCod = lifecycle === 'cancelled' ? true : rng() < 0.4;
    const chosen = shuffled(rng, sellable).slice(0, 1 + Math.floor(rng() * 3));

    const lines = chosen.map((product) => {
      const price = prices.get(String(product.id))!;
      const quantity = 1 + Math.floor(rng() * 2);
      const store = storeById.get(String(product.storeId))!;

      return {
        product,
        store,
        item: {
          variantId: price.variantId,
          productId: product.id,
          storeId: product.storeId,
          productName: product.name,
          storeName: store.name,
          sku: price.sku,
          quantity: quantity,
          unitPrice: price.unitPrice,
          lineTotal: money(price.unitPrice * quantity),
        },
      };
    });

    const itemsSubtotal = money(lines.reduce((sum, line) => sum + line.item.lineTotal, 0));
    const useCoupon = Boolean(welcome) && itemsSubtotal >= 30 && rng() < 0.2;
    const couponDiscount = useCoupon ? money(Math.min(itemsSubtotal * 0.1, itemsSubtotal)) : 0;
    const discounted = money(itemsSubtotal - couponDiscount);
    const deliveryFee =
      siteSettingsSeed.freeDeliveryEnabled &&
      itemsSubtotal >= siteSettingsSeed.freeDeliveryMinAmount
        ? 0
        : siteSettingsSeed.deliveryFee;
    const grandTotal = money(discounted + deliveryFee);
    const isDelivered = lifecycle === 'delivered';
    const isCancelled = lifecycle === 'cancelled';
    const orderNumber = orderNumberFor(index, createdAt);
    const paid = !isCancelled && (!isCod || isDelivered);

    const order = await OrderModel.create({
      orderNumber,
      customerId: customer.id,
      idempotencyKey: `${ORDER_KEY_PREFIX}${index}`,
      paymentMethod: isCod ? 'cod' : 'prepaid',
      status: lifecycle,
      fulfillmentStatus: lifecycle,
      paymentStatus: paid ? 'paid' : isCancelled || !isCod ? 'unpaid' : 'partially_paid',
      codCollectionStatus: !isCod ? 'not_applicable' : isDelivered ? 'collected' : 'pending',
      codExpectedAmount: isCod ? discounted : null,
      codCollectedAmount: isCod && isDelivered ? discounted : null,
      codCourierReference: isCod && isDelivered ? `CR-${orderNumber.slice(-6)}` : '',
      codRemittanceStatus: !isCod ? 'not_applicable' : isDelivered ? 'remitted' : 'expected',
      codRemittedAmount: isCod && isDelivered ? discounted : null,
      shipping: {
        recipientName: `${customer.firstName} ${customer.lastName}`,
        phone: customer.phone,
        line1: `House ${1 + Math.floor(rng() * 90)}, Road ${1 + Math.floor(rng() * 24)}`,
        line2: '',
        city: customer.city,
        state: customer.state,
        postalCode: customer.postalCode,
        country: 'Bangladesh',
      },
      note: '',
      items: lines.map((line) => line.item),
      stockReservations: [],
      itemsSubtotal,
      couponId: useCoupon ? welcome!._id : null,
      couponCode: useCoupon ? 'WELCOME10' : null,
      couponDiscount,
      deliveryFee,
      grandTotal,
      amountDueNow: isCod ? deliveryFee : grandTotal,
      amountPaid: isCancelled ? 0 : paid ? grandTotal : isCod ? deliveryFee : grandTotal,
      amountRefunded: 0,
      balanceDue: paid || isCancelled ? 0 : isCod ? discounted : 0,
      refundableAmount: isCancelled ? 0 : paid || !isCod ? grandTotal : deliveryFee,
      currency: 'BDT',
      stockHoldExpiresAt: null,
      stockReleasedAt: null,
      saleRecordedAt: isCancelled ? null : createdAt,
      createdAt,
      updatedAt: createdAt,
    });

    const byStore = new Map<string, typeof lines>();

    for (const line of lines) {
      const key = String(line.product.storeId);
      byStore.set(key, [...(byStore.get(key) ?? []), line]);
    }

    let storeIndex = 1;

    for (const [storeId, storeLines] of byStore) {
      const store = storeById.get(storeId)!;
      const subtotal = money(storeLines.reduce((sum, line) => sum + line.item.lineTotal, 0));
      const commissionAmount = money((subtotal * COMMISSION_RATE) / 100);
      const fulfilled = lifecycle === 'shipped' || isDelivered;

      await VendorOrderModel.create({
        parentOrderId: order._id,
        orderNumber,
        vendorOrderNumber: `${orderNumber}-S${storeIndex}`,
        storeId: store._id,
        storeName: store.name,
        vendorUserId: store.userId,
        status: vendorStatusFor(lifecycle, ageDays),
        items: storeLines.map(({ item }) => ({
          variantId: item.variantId,
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          quantity: item.quantity,
          expectedQty: item.quantity,
          targetQty: item.quantity,
          acceptedQtyCumulative: fulfilled ? item.quantity : 0,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
        itemsSubtotal: subtotal,
        commissionRate: isDelivered ? COMMISSION_RATE : null,
        commissionAmount: isDelivered ? commissionAmount : null,
        vendorEarnings: isDelivered ? money(subtotal - commissionAmount) : null,
        createdAt,
        updatedAt: createdAt,
      });
      storeIndex += 1;
      vendorOrderCount += 1;
    }
  }

  return { orders: ORDER_COUNT, vendorOrders: vendorOrderCount };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

async function seedSite() {
  assertSeedingAllowed();
  await connectDatabase();
  logger.info('Seeding site content', { target: describeMongoTarget() });

  const products = await loadSeedProducts();
  const customers = await loadCustomers();
  const prices = await loadUnitPrices(products.map((product) => product.id));

  const summary = {
    heroSlides: await seedHero(),
    featuredCategories: await seedFeaturedCategories(),
    coupons: await seedCoupons(),
    flashDeals: await seedFlashDeals(products),
    sponsoredPlacements: await seedSponsored(products),
    catalogSignals: await seedCatalogSignals(products, prices),
    reviews: await seedReviews(products, customers),
    recentlyViewed: await seedRecentlyViewed(products, customers),
    orders: await seedOrders(products, customers, prices),
  };

  await seedSiteSettings();
  await variantService.rebuildListings();
  await flushPublicCaches();

  logger.info('Site seed complete', {
    ...summary,
    customers: customers.length,
    login: `any *@${DEMO_EMAIL_DOMAIN} account, password ${DEMO_PASSWORD}`,
  });
  await disconnectDatabase();
}

seedSite().catch(async (error: unknown) => {
  logger.error('Site seed failed', { err: error });
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
