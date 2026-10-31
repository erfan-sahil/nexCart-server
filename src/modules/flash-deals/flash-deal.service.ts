import { Types, type FilterQuery } from 'mongoose';
import { DEFAULT_FLASH_DEAL_SECTION_TITLE } from './constants';
import {
  FlashDealCampaignModel,
  FlashDealItemModel,
  type FlashDealCampaign,
  type FlashDealItem,
} from './flash-deal.model';
import { migrateLegacyFlashDeals } from './flash-deal.migrate';
import {
  flashPriceFromListPrice,
  flashSavingsOnListPrice,
  isFlashPriceValid,
} from './flash-deal-pricing';
import type {
  FlashDealCampaignDetailDto,
  FlashDealCampaignDto,
  FlashDealDiscountType,
  FlashDealItemDto,
  FlashDealLifecycle,
  FlashDealPublicMetaDto,
  FlashDealSettingsDto,
} from './types';
import { AppError } from '../../common/errors/AppError';
import { ProductModel } from '../products/product.model';
import { ProductVariantModel } from '../products/product-variant.model';
import { StoreModel, isStoreListed } from '../stores/store.model';
import type { ProductOfferDto } from '../products/types';
import type {
  CreateFlashDealCampaignInput,
  CreateFlashDealItemInput,
  ListFlashDealsQuery,
  SetFlashDealEnabledInput,
  UpdateFlashDealCampaignInput,
  UpdateFlashDealItemInput,
} from './flash-deal.validator';

type ActiveFlashDeal = {
  id: string;
  campaignId: string;
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

const ensureMigrated = async () => {
  await migrateLegacyFlashDeals();
};

const campaignIsEnabled = (campaign: Pick<FlashDealCampaign, 'isEnabled'>) =>
  campaign.isEnabled !== false;

const campaignLifecycle = (
  campaign: Pick<FlashDealCampaign, 'startsAt' | 'endsAt'>,
  now: Date,
): FlashDealLifecycle => {
  if (campaign.endsAt <= now) {
    return 'ended';
  }

  if (campaign.startsAt > now) {
    return 'upcoming';
  }

  return 'active';
};

const campaignDto = (
  campaign: FlashDealCampaign,
  itemCount: number,
  now = new Date(),
): FlashDealCampaignDto => ({
  id: String(campaign._id),
  name: campaign.name,
  startsAt: campaign.startsAt.toISOString(),
  endsAt: campaign.endsAt.toISOString(),
  isEnabled: campaignIsEnabled(campaign),
  lifecycle: campaignLifecycle(campaign, now),
  itemCount,
  createdAt: campaign.createdAt.toISOString(),
  updatedAt: campaign.updatedAt.toISOString(),
});

const itemDto = (
  item: FlashDealItem,
  product: { name: string; slug: string },
  storeName: string,
): FlashDealItemDto => ({
  id: String(item._id),
  campaignId: String(item.campaignId),
  productId: String(item.productId),
  productName: product.name,
  productSlug: product.slug,
  storeName,
  discountType: item.discountType,
  discountValue: item.discountValue,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
});

const statusFilter = (
  status: ListFlashDealsQuery['status'],
  now: Date,
): FilterQuery<FlashDealCampaign> => {
  if (status === 'active') {
    return { endsAt: { $gt: now } };
  }

  if (status === 'ended') {
    return { endsAt: { $lte: now } };
  }

  return {};
};

const assertDealWindow = (startsAt: Date, endsAt: Date) => {
  if (startsAt >= endsAt) {
    throw AppError.validation('Deal end must be after the start');
  }
};

/** Only one enabled, non-ended flash deal may cover any point in time. */
const assertNoScheduleConflict = async (startsAt: Date, endsAt: Date, excludeId?: string) => {
  const now = new Date();
  const filter: FilterQuery<FlashDealCampaign> = {
    isEnabled: { $ne: false },
    endsAt: { $gt: now },
    startsAt: { $lt: endsAt },
  };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  const candidates = await FlashDealCampaignModel.find(filter)
    .select('name startsAt endsAt')
    .lean();

  const conflict = candidates.find((campaign) => campaign.endsAt > startsAt);

  if (!conflict) {
    return;
  }

  const conflictIsActive = conflict.startsAt <= now && conflict.endsAt > now;

  throw AppError.conflict(
    conflictIsActive
      ? `Only one flash deal can be active at a time. "${conflict.name}" is already running.`
      : `Schedule overlaps with "${conflict.name}". Only one flash deal can run at a time.`,
  );
};

const loadCampaign = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw AppError.notFound('Flash deal not found');
  }

  const campaign = await FlashDealCampaignModel.findById(id);

  if (!campaign) {
    throw AppError.notFound('Flash deal not found');
  }

  return campaign;
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

const assertNoOpenItemForProduct = async (productId: string, excludeItemId?: string) => {
  const now = new Date();
  const openCampaigns = await FlashDealCampaignModel.find({ endsAt: { $gt: now } })
    .select('_id')
    .lean();

  if (openCampaigns.length === 0) {
    return;
  }

  const filter: FilterQuery<FlashDealItem> = {
    productId,
    campaignId: { $in: openCampaigns.map((campaign) => campaign._id) },
  };

  if (excludeItemId) {
    filter._id = { $ne: excludeItemId };
  }

  const open = await FlashDealItemModel.exists(filter);

  if (open) {
    throw AppError.conflict('This product already has an open flash deal');
  }
};

const enrichItems = async (items: FlashDealItem[]): Promise<FlashDealItemDto[]> => {
  if (items.length === 0) {
    return [];
  }

  const productIds = items.map((item) => item.productId);
  const products = await ProductModel.find({ _id: { $in: productIds } })
    .select('name slug storeId')
    .lean();
  const productsById = new Map(products.map((product) => [String(product._id), product]));
  const storeIds = [...new Set(products.map((product) => String(product.storeId)))];
  const stores = await StoreModel.find({ _id: { $in: storeIds } })
    .select('name')
    .lean();
  const storesById = new Map(stores.map((store) => [String(store._id), store.name]));

  return items.map((item) => {
    const product = productsById.get(String(item.productId));

    return itemDto(
      item,
      product ?? { name: '', slug: '' },
      storesById.get(String(product?.storeId)) ?? '',
    );
  });
};

const itemCountsByCampaign = async (campaignIds: Types.ObjectId[]) => {
  if (campaignIds.length === 0) {
    return new Map<string, number>();
  }

  const rows = await FlashDealItemModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { campaignId: { $in: campaignIds } } },
    { $group: { _id: '$campaignId', count: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), row.count]));
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

const findActiveCampaign = async (now = new Date()) => {
  return FlashDealCampaignModel.findOne({
    isEnabled: { $ne: false },
    startsAt: { $lte: now },
    endsAt: { $gt: now },
  })
    .sort({ endsAt: 1 })
    .lean();
};

export const flashDealService = {
  async getSettings(): Promise<FlashDealSettingsDto> {
    const meta = await this.getPublicMeta();
    return { sectionTitle: meta.sectionTitle };
  },

  async getPublicMeta(now = new Date()): Promise<FlashDealPublicMetaDto> {
    await ensureMigrated();
    const soonest = await findActiveCampaign(now);

    return {
      sectionTitle: soonest?.name ?? DEFAULT_FLASH_DEAL_SECTION_TITLE,
      endsAt: soonest?.endsAt ? soonest.endsAt.toISOString() : null,
    };
  },

  async create(input: CreateFlashDealCampaignInput) {
    await ensureMigrated();
    assertDealWindow(input.startsAt, input.endsAt);
    await assertNoScheduleConflict(input.startsAt, input.endsAt);

    const created = await FlashDealCampaignModel.create({
      name: input.name.trim(),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      isEnabled: true,
    });

    return campaignDto(created, 0);
  },

  async setEnabled(id: string, input: SetFlashDealEnabledInput) {
    await ensureMigrated();
    const campaign = await loadCampaign(id);
    const now = new Date();

    if (campaign.endsAt <= now) {
      throw AppError.validation('Ended deals cannot be activated or deactivated');
    }

    if (input.isEnabled) {
      await assertNoScheduleConflict(campaign.startsAt, campaign.endsAt, String(campaign._id));
    }

    campaign.isEnabled = input.isEnabled;
    await campaign.save();

    const counts = await itemCountsByCampaign([campaign._id]);
    return campaignDto(campaign, counts.get(String(campaign._id)) ?? 0);
  },

  async update(id: string, input: UpdateFlashDealCampaignInput) {
    await ensureMigrated();
    const campaign = await loadCampaign(id);
    const now = new Date();

    if (campaign.endsAt <= now) {
      throw AppError.validation('Ended deals cannot be edited');
    }

    const startsAt = input.startsAt ?? campaign.startsAt;
    const endsAt = input.endsAt ?? campaign.endsAt;
    assertDealWindow(startsAt, endsAt);
    await assertNoScheduleConflict(startsAt, endsAt, String(campaign._id));

    if (input.name !== undefined) {
      campaign.name = input.name.trim();
    }

    campaign.startsAt = startsAt;
    campaign.endsAt = endsAt;
    await campaign.save();

    const counts = await itemCountsByCampaign([campaign._id]);
    return campaignDto(campaign, counts.get(String(campaign._id)) ?? 0);
  },

  async endNow(id: string) {
    await ensureMigrated();
    const campaign = await loadCampaign(id);
    campaign.endsAt = new Date();
    await campaign.save();

    const counts = await itemCountsByCampaign([campaign._id]);
    return campaignDto(campaign, counts.get(String(campaign._id)) ?? 0);
  },

  async getById(id: string): Promise<FlashDealCampaignDetailDto> {
    await ensureMigrated();
    const campaign = await loadCampaign(id);
    const items = await FlashDealItemModel.find({ campaignId: campaign._id })
      .sort({ createdAt: 1 })
      .lean();

    return {
      ...campaignDto(campaign, items.length),
      items: await enrichItems(items),
    };
  },

  async listManage(query: ListFlashDealsQuery) {
    await ensureMigrated();
    const now = new Date();
    const filter: FilterQuery<FlashDealCampaign> = {
      ...statusFilter(query.status, now),
    };

    const search = query.search?.trim();

    if (search) {
      filter.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }

    const skip = (query.page - 1) * query.limit;
    const sort: Record<string, 1 | -1> =
      query.status === 'ended'
        ? { endsAt: -1 }
        : query.status === 'active'
          ? { startsAt: 1 }
          : { startsAt: -1 };

    const [campaigns, total] = await Promise.all([
      FlashDealCampaignModel.find(filter).sort(sort).skip(skip).limit(query.limit).lean(),
      FlashDealCampaignModel.countDocuments(filter),
    ]);

    const counts = await itemCountsByCampaign(campaigns.map((campaign) => campaign._id));

    return {
      items: campaigns.map((campaign) =>
        campaignDto(campaign as FlashDealCampaign, counts.get(String(campaign._id)) ?? 0, now),
      ),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async addItem(campaignId: string, input: CreateFlashDealItemInput) {
    await ensureMigrated();
    const campaign = await loadCampaign(campaignId);
    const now = new Date();

    if (campaign.endsAt <= now) {
      throw AppError.validation('Cannot add products to an ended flash deal');
    }

    const { product, storeName } = await loadListedProduct(input.productId);
    await assertDiscountOnVariants(input.productId, input.discountType, input.discountValue);
    await assertNoOpenItemForProduct(input.productId);

    try {
      const created = await FlashDealItemModel.create({
        campaignId: campaign._id,
        productId: product._id,
        discountType: input.discountType,
        discountValue: input.discountValue,
      });

      return itemDto(created, product, storeName);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error &&
        'code' in error &&
        (error as { code?: number }).code === 11000
      ) {
        throw AppError.conflict('This product is already in the flash deal');
      }

      throw error;
    }
  },

  async updateItem(campaignId: string, itemId: string, input: UpdateFlashDealItemInput) {
    await ensureMigrated();
    const campaign = await loadCampaign(campaignId);
    const now = new Date();

    if (campaign.endsAt <= now) {
      throw AppError.validation('Ended deals cannot be edited');
    }

    if (!Types.ObjectId.isValid(itemId)) {
      throw AppError.notFound('Flash deal product not found');
    }

    const item = await FlashDealItemModel.findOne({
      _id: itemId,
      campaignId: campaign._id,
    });

    if (!item) {
      throw AppError.notFound('Flash deal product not found');
    }

    const discountType = input.discountType ?? item.discountType;
    const discountValue = input.discountValue ?? item.discountValue;
    await assertDiscountOnVariants(String(item.productId), discountType, discountValue);

    item.discountType = discountType;
    item.discountValue = discountValue;
    await item.save();

    const product = await ProductModel.findById(item.productId).select('name slug storeId');
    const store = await StoreModel.findById(product!.storeId).select('name');

    return itemDto(item, product!, store?.name ?? '');
  },

  async removeItem(campaignId: string, itemId: string) {
    await ensureMigrated();
    const campaign = await loadCampaign(campaignId);

    if (!Types.ObjectId.isValid(itemId)) {
      throw AppError.notFound('Flash deal product not found');
    }

    const deleted = await FlashDealItemModel.findOneAndDelete({
      _id: itemId,
      campaignId: campaign._id,
    });

    if (!deleted) {
      throw AppError.notFound('Flash deal product not found');
    }
  },

  async findActiveByProductIds(productIds: string[], now = new Date()) {
    await ensureMigrated();

    if (productIds.length === 0) {
      return new Map<string, ActiveFlashDeal>();
    }

    const activeCampaigns = await FlashDealCampaignModel.find({
      isEnabled: { $ne: false },
      startsAt: { $lte: now },
      endsAt: { $gt: now },
    })
      .select('_id startsAt endsAt')
      .lean();

    if (activeCampaigns.length === 0) {
      return new Map<string, ActiveFlashDeal>();
    }

    const campaignsById = new Map(
      activeCampaigns.map((campaign) => [String(campaign._id), campaign]),
    );

    const items = await FlashDealItemModel.find({
      productId: { $in: productIds },
      campaignId: { $in: activeCampaigns.map((campaign) => campaign._id) },
    }).lean();

    const map = new Map<string, ActiveFlashDeal>();

    for (const item of items) {
      const campaign = campaignsById.get(String(item.campaignId));

      if (!campaign) {
        continue;
      }

      const productId = String(item.productId);
      const existing = map.get(productId);

      if (existing && existing.endsAt.getTime() <= campaign.endsAt.getTime()) {
        continue;
      }

      map.set(productId, {
        id: String(item._id),
        campaignId: String(campaign._id),
        productId,
        discountType: item.discountType,
        discountValue: item.discountValue,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
      });
    }

    return map;
  },

  async findActiveDealForProduct(productId: string, now = new Date()) {
    const map = await this.findActiveByProductIds([productId], now);
    return map.get(productId) ?? null;
  },

  async listActiveProductIds(now = new Date()) {
    await ensureMigrated();
    const activeCampaigns = await FlashDealCampaignModel.find({
      isEnabled: { $ne: false },
      startsAt: { $lte: now },
      endsAt: { $gt: now },
    })
      .select('_id endsAt')
      .lean();

    if (activeCampaigns.length === 0) {
      return [];
    }

    const endsByCampaign = new Map(
      activeCampaigns.map((campaign) => [String(campaign._id), campaign.endsAt]),
    );

    const items = await FlashDealItemModel.find({
      campaignId: { $in: activeCampaigns.map((campaign) => campaign._id) },
    })
      .select('productId campaignId discountType discountValue')
      .lean();

    return items.map((item) => ({
      productId: String(item.productId),
      discountType: item.discountType,
      discountValue: item.discountValue,
      endsAt: endsByCampaign.get(String(item.campaignId)) ?? now,
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
