import { Types, type FilterQuery } from 'mongoose';
import { DEFAULT_FLASH_DEAL_SECTION_TITLE, FLASH_DEAL_SETTINGS_KEY } from './constants';
import { FlashDealModel, FlashDealSettingsModel, type FlashDeal } from './flash-deal.model';
import {
  flashPriceFromListPrice,
  flashSavingsOnListPrice,
  isFlashPriceValid,
} from './flash-deal-pricing';
import type {
  FlashDealDiscountType,
  FlashDealDto,
  FlashDealPublicMetaDto,
  FlashDealSettingsDto,
} from './types';
import { AppError } from '../../common/errors/AppError';
import { ProductModel } from '../products/product.model';
import { ProductVariantModel } from '../products/product-variant.model';
import { StoreModel, isStoreListed } from '../stores/store.model';
import type { ProductOfferDto } from '../products/types';
import type {
  CreateFlashDealInput,
  ListFlashDealsQuery,
  UpdateFlashDealInput,
  UpdateFlashDealSettingsInput,
} from './flash-deal.validator';

type ActiveFlashDeal = {
  id: string;
  productId: string;
  discountType: FlashDealDiscountType;
  discountValue: number;
  startsAt: Date;
  endsAt: Date;
};

const isListedProduct = (product: {
  status: string;
  isPublished: boolean;
  approvalStatus: string;
}) => product.approvalStatus === 'approved' && product.status === 'active' && product.isPublished;

const settingsDto = (sectionTitle: string): FlashDealSettingsDto => ({
  sectionTitle,
});

const toDto = (
  deal: FlashDeal,
  product: { name: string; slug: string },
  storeName: string,
): FlashDealDto => ({
  id: String(deal._id),
  productId: String(deal.productId),
  productName: product.name,
  productSlug: product.slug,
  storeName,
  discountType: deal.discountType,
  discountValue: deal.discountValue,
  startsAt: deal.startsAt.toISOString(),
  endsAt: deal.endsAt.toISOString(),
  createdAt: deal.createdAt.toISOString(),
  updatedAt: deal.updatedAt.toISOString(),
});

const ensureSettings = async () => {
  const existing = await FlashDealSettingsModel.findOne({ key: FLASH_DEAL_SETTINGS_KEY });

  if (existing) {
    return existing;
  }

  return FlashDealSettingsModel.create({
    key: FLASH_DEAL_SETTINGS_KEY,
    sectionTitle: DEFAULT_FLASH_DEAL_SECTION_TITLE,
  });
};

const statusFilter = (status: ListFlashDealsQuery['status'], now: Date): FilterQuery<FlashDeal> => {
  if (status === 'active') {
    return { startsAt: { $lte: now }, endsAt: { $gt: now } };
  }

  if (status === 'upcoming') {
    return { startsAt: { $gt: now } };
  }

  return { endsAt: { $lte: now } };
};

const assertDealWindow = (startsAt: Date, endsAt: Date) => {
  if (startsAt >= endsAt) {
    throw AppError.validation('Deal end must be after the start');
  }
};

const loadListedProduct = async (productId: string) => {
  if (!Types.ObjectId.isValid(productId)) {
    throw AppError.validation('Product is invalid');
  }

  const product = await ProductModel.findById(productId).select(
    'name slug storeId status isPublished approvalStatus listing.hasStock',
  );

  if (!product || !isListedProduct(product)) {
    throw AppError.validation('Choose an approved visible product');
  }

  if (!product.listing?.hasStock) {
    throw AppError.validation('Choose a product that is in stock');
  }

  const store = await StoreModel.findById(product.storeId).select('name isActive suspendedAt');

  if (!isStoreListed(store)) {
    throw AppError.validation('Choose a product from an active store');
  }

  return { product, storeName: store!.name };
};

const assertDiscountOnVariants = async (
  productId: string,
  discountType: FlashDealDiscountType,
  discountValue: number,
) => {
  const variants = await ProductVariantModel.find({ productId, status: 'active' }).select(
    'price stock',
  );

  if (variants.length === 0) {
    throw AppError.validation('Product has no active variants');
  }

  for (const variant of variants) {
    if (variant.stock <= 0) {
      continue;
    }

    if (!isFlashPriceValid(variant.price, discountType, discountValue)) {
      throw AppError.validation('Discount amount is too large for at least one variant list price');
    }
  }
};

const assertNoOpenDeal = async (productId: string, excludeId?: string) => {
  const now = new Date();
  const filter: FilterQuery<FlashDeal> = {
    productId,
    endsAt: { $gt: now },
  };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  const open = await FlashDealModel.exists(filter);

  if (open) {
    throw AppError.conflict('This product already has an open flash deal');
  }
};

const variantRowsForProducts = async (productIds: string[]) => {
  if (productIds.length === 0) {
    return new Map<
      string,
      Array<{ price: number; stock: number; isDefault: boolean; variantId: string }>
    >();
  }

  const rows = await ProductVariantModel.find({
    productId: { $in: productIds },
    status: 'active',
  })
    .select('_id productId price stock isDefault')
    .lean();

  const grouped = new Map<
    string,
    Array<{ price: number; stock: number; isDefault: boolean; variantId: string }>
  >();

  for (const row of rows) {
    const key = String(row.productId);
    const list = grouped.get(key) ?? [];
    list.push({
      variantId: String(row._id),
      price: row.price,
      stock: row.stock,
      isDefault: Boolean(row.isDefault),
    });
    grouped.set(key, list);
  }

  return grouped;
};

const buildFlashOffer = (
  variants: Array<{ price: number; stock: number; isDefault: boolean; variantId: string }>,
  deal: Pick<ActiveFlashDeal, 'discountType' | 'discountValue'>,
): ProductOfferDto => {
  const inStockVariants = variants.filter((variant) => variant.stock > 0);
  const priced = inStockVariants.flatMap((variant) => {
    if (!isFlashPriceValid(variant.price, deal.discountType, deal.discountValue)) {
      return [];
    }

    const current = flashPriceFromListPrice(variant.price, deal.discountType, deal.discountValue);

    return [
      {
        current,
        original: variant.price,
        variantId: variant.variantId,
        isDefault: variant.isDefault,
      },
    ];
  });

  if (priced.length === 0) {
    return {
      minPrice: null,
      maxPrice: null,
      minOriginalPrice: null,
      maxOriginalPrice: null,
      inStock: false,
      variantCount: variants.length,
      defaultVariantId: null,
    };
  }

  const currents = priced.map((row) => row.current);
  const originals = priced.map((row) => row.original);
  const defaultVariant =
    priced.find((row) => row.isDefault)?.variantId ?? priced[0]?.variantId ?? null;

  return {
    minPrice: Math.min(...currents),
    maxPrice: Math.max(...currents),
    minOriginalPrice: Math.min(...originals),
    maxOriginalPrice: Math.max(...originals),
    inStock: true,
    variantCount: variants.length,
    defaultVariantId: defaultVariant,
  };
};

export const flashDealService = {
  async getSettings(): Promise<FlashDealSettingsDto> {
    const settings = await ensureSettings();
    return settingsDto(settings.sectionTitle);
  },

  async updateSettings(input: UpdateFlashDealSettingsInput) {
    const settings = await ensureSettings();
    settings.sectionTitle = input.sectionTitle;
    await settings.save();
    return settingsDto(settings.sectionTitle);
  },

  async getPublicMeta(now = new Date()): Promise<FlashDealPublicMetaDto> {
    const [settings, soonest] = await Promise.all([
      this.getSettings(),
      FlashDealModel.findOne({ startsAt: { $lte: now }, endsAt: { $gt: now } })
        .sort({ endsAt: 1 })
        .select('endsAt')
        .lean(),
    ]);

    return {
      sectionTitle: settings.sectionTitle,
      endsAt: soonest?.endsAt ? soonest.endsAt.toISOString() : null,
    };
  },

  async create(input: CreateFlashDealInput) {
    assertDealWindow(input.startsAt, input.endsAt);
    const { product, storeName } = await loadListedProduct(input.productId);
    await assertDiscountOnVariants(input.productId, input.discountType, input.discountValue);
    await assertNoOpenDeal(input.productId);

    const created = await FlashDealModel.create({
      productId: product._id,
      discountType: input.discountType,
      discountValue: input.discountValue,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });

    return toDto(created, product, storeName);
  },

  async update(id: string, input: UpdateFlashDealInput) {
    const deal = await FlashDealModel.findById(id);

    if (!deal) {
      throw AppError.notFound('Flash deal not found');
    }

    const now = new Date();

    if (deal.endsAt <= now) {
      throw AppError.validation('Ended deals cannot be edited');
    }

    const startsAt = input.startsAt ?? deal.startsAt;
    const endsAt = input.endsAt ?? deal.endsAt;
    const discountType = input.discountType ?? deal.discountType;
    const discountValue = input.discountValue ?? deal.discountValue;

    assertDealWindow(startsAt, endsAt);
    await assertDiscountOnVariants(String(deal.productId), discountType, discountValue);

    deal.discountType = discountType;
    deal.discountValue = discountValue;
    deal.startsAt = startsAt;
    deal.endsAt = endsAt;
    await deal.save();

    const product = await ProductModel.findById(deal.productId).select('name slug storeId');
    const store = await StoreModel.findById(product!.storeId).select('name');

    return toDto(deal, product!, store?.name ?? '');
  },

  async endNow(id: string) {
    const deal = await FlashDealModel.findById(id);

    if (!deal) {
      throw AppError.notFound('Flash deal not found');
    }

    deal.endsAt = new Date();
    await deal.save();

    const product = await ProductModel.findById(deal.productId).select('name slug storeId');
    const store = await StoreModel.findById(product!.storeId).select('name');

    return toDto(deal, product!, store?.name ?? '');
  },

  async listManage(query: ListFlashDealsQuery) {
    const now = new Date();
    const filter = statusFilter(query.status, now);
    const skip = (query.page - 1) * query.limit;
    const [deals, total] = await Promise.all([
      FlashDealModel.find(filter)
        .sort(
          query.status === 'ended'
            ? { endsAt: -1 }
            : query.status === 'upcoming'
              ? { startsAt: 1 }
              : { endsAt: 1 },
        )
        .skip(skip)
        .limit(query.limit)
        .lean(),
      FlashDealModel.countDocuments(filter),
    ]);

    const productIds = deals.map((deal) => deal.productId);
    const products = await ProductModel.find({ _id: { $in: productIds } })
      .select('name slug storeId')
      .lean();
    const productsById = new Map(products.map((product) => [String(product._id), product]));
    const storeIds = [...new Set(products.map((product) => String(product.storeId)))];
    const stores = await StoreModel.find({ _id: { $in: storeIds } })
      .select('name')
      .lean();
    const storesById = new Map(stores.map((store) => [String(store._id), store.name]));

    return {
      items: deals.map((deal) => {
        const product = productsById.get(String(deal.productId));

        return toDto(
          deal,
          product ?? { name: '', slug: '' },
          storesById.get(String(product?.storeId)) ?? '',
        );
      }),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async findActiveByProductIds(productIds: string[], now = new Date()) {
    if (productIds.length === 0) {
      return new Map<string, ActiveFlashDeal>();
    }

    const deals = await FlashDealModel.find({
      productId: { $in: productIds },
      startsAt: { $lte: now },
      endsAt: { $gt: now },
    }).lean();

    const map = new Map<string, ActiveFlashDeal>();

    for (const deal of deals) {
      map.set(String(deal.productId), {
        id: String(deal._id),
        productId: String(deal.productId),
        discountType: deal.discountType,
        discountValue: deal.discountValue,
        startsAt: deal.startsAt,
        endsAt: deal.endsAt,
      });
    }

    return map;
  },

  async findActiveDealForProduct(productId: string, now = new Date()) {
    const map = await this.findActiveByProductIds([productId], now);
    return map.get(productId) ?? null;
  },

  async listActiveProductIds(now = new Date()) {
    const deals = await FlashDealModel.find({
      startsAt: { $lte: now },
      endsAt: { $gt: now },
    })
      .select('productId discountType discountValue endsAt')
      .lean();

    return deals.map((deal) => ({
      productId: String(deal.productId),
      discountType: deal.discountType,
      discountValue: deal.discountValue,
      endsAt: deal.endsAt,
      savings: 0,
    }));
  },

  async applyFlashOffers<T extends { id: string; offer: ProductOfferDto }>(
    items: T[],
    now = new Date(),
  ): Promise<T[]> {
    if (items.length === 0) {
      return items;
    }

    const deals = await this.findActiveByProductIds(
      items.map((item) => item.id),
      now,
    );

    if (deals.size === 0) {
      return items;
    }

    const variants = await variantRowsForProducts([...deals.keys()]);

    return items.map((item) => {
      const deal = deals.get(item.id);

      if (!deal) {
        return item;
      }

      const rows = variants.get(item.id) ?? [];
      return {
        ...item,
        offer: buildFlashOffer(rows, deal),
      };
    });
  },

  async maxSavingsForProduct(
    productId: string,
    deal: Pick<ActiveFlashDeal, 'discountType' | 'discountValue'>,
  ) {
    const variants = await variantRowsForProducts([productId]);
    const rows = variants.get(productId) ?? [];

    return rows.reduce((max, variant) => {
      if (variant.stock <= 0) {
        return max;
      }

      return Math.max(
        max,
        flashSavingsOnListPrice(variant.price, deal.discountType, deal.discountValue),
      );
    }, 0);
  },
};

export type { ActiveFlashDeal };
