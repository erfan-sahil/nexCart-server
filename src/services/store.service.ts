import { Types, type FilterQuery, type HydratedDocument } from 'mongoose';
import { CategoryModel } from '../models/category.model';
import { StoreModel, type Store } from '../models/store.model';
import { StorePayoutModel, type StorePayout } from '../models/storePayout.model';
import type {
  PublicStoreDto,
  PublicStoreSummaryDto,
  StoreCategoryDto,
  StorePayoutDto,
  VendorStoreDto,
} from '../types/store';
import type { VendorAddressDto } from '../types/vendorApplication';
import { AppError } from '../utils/AppError';
import { duplicateKeyFields, isDuplicateKeyError } from '../utils/mongoError';
import { escapeRegex, slugify } from '../utils/slugify';
import type {
  ListStoresQuery,
  SaveStorePayoutInput,
  UpdateStoreInput,
} from '../validators/store.validator';

type AddressSource = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type StoreSeed = {
  userId: string;
  name: string;
  description: string;
  email: string;
  phone: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  categoryIds: string[];
};

const SORTS: Record<ListStoresQuery['sort'], Record<string, 1 | -1>> = {
  name: { name: 1 },
  '-name': { name: -1 },
  joinedAt: { joinedAt: 1 },
  '-joinedAt': { joinedAt: -1 },
  rating: { ratingAverage: 1 },
  '-rating': { ratingAverage: -1 },
};

const toAddressDto = (address: AddressSource | null | undefined): VendorAddressDto => ({
  line1: address?.line1 ?? '',
  line2: address?.line2 ?? '',
  city: address?.city ?? '',
  state: address?.state ?? '',
  postalCode: address?.postalCode ?? '',
  country: address?.country ?? '',
});

const toSummary = (store: Store): PublicStoreSummaryDto => ({
  id: String(store._id),
  slug: store.slug,
  name: store.name,
  logo: store.logo,
  rating: {
    average: store.ratingAverage,
    count: store.ratingCount,
  },
  totalProducts: store.totalProducts,
  totalOrders: store.totalOrders,
  totalSales: store.totalSales,
  joinedAt: store.joinedAt.toISOString(),
});

const toPublicDto = (store: Store, categories: StoreCategoryDto[]): PublicStoreDto => ({
  ...toSummary(store),
  banner: store.banner,
  description: store.description,
  contact: {
    email: store.contact.email,
    phone: store.contact.phone,
  },
  address: toAddressDto(store.address),
  categories,
  returnPolicy: store.returnPolicy,
  shippingPolicy: store.shippingPolicy,
});

const toPayoutDto = (payout: StorePayout): StorePayoutDto => {
  const updatedAt = payout.updatedAt.toISOString();

  if (payout.method === 'mobile') {
    return {
      method: 'mobile',
      accountHolderName: payout.accountHolderName,
      provider: payout.provider,
      accountNumber: payout.accountNumber,
      updatedAt,
    };
  }

  if (payout.method === 'bank') {
    return {
      method: 'bank',
      accountHolderName: payout.accountHolderName,
      bankName: payout.bankName,
      accountNumber: payout.accountNumber,
      branchName: payout.branchName,
      routingNumber: payout.routingNumber,
      updatedAt,
    };
  }

  throw AppError.internal('Stored payout method is invalid');
};

const toVendorDto = (
  store: Store,
  categories: StoreCategoryDto[],
  payout: StorePayout | null,
): VendorStoreDto => ({
  ...toPublicDto(store, categories),
  isActive: store.isActive,
  payout: payout ? toPayoutDto(payout) : null,
});

const slugTaken = async (slug: string, excludeId?: string) => {
  const filter: FilterQuery<Store> = { slug };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  return StoreModel.exists(filter);
};

const resolveSlug = async (requested: string | undefined, name: string, excludeId?: string) => {
  const base = slugify(requested ?? name);

  if (base.length < 2) {
    throw AppError.validation('Could not generate a valid slug from the store name');
  }

  if (requested) {
    if (await slugTaken(base, excludeId)) {
      throw AppError.conflict('A store with this slug already exists');
    }

    return base;
  }

  let candidate = base;

  for (let suffix = 2; suffix <= 50; suffix += 1) {
    if (!(await slugTaken(candidate, excludeId))) {
      return candidate;
    }

    const extra = `-${suffix}`;
    candidate = `${base.slice(0, 80 - extra.length)}${extra}`;
  }

  throw AppError.conflict('A store with this slug already exists');
};

const assertCategories = async (categoryIds: string[]) => {
  const categories = await CategoryModel.find({ _id: { $in: categoryIds } }).select('_id isActive');

  if (categories.length !== categoryIds.length) {
    throw AppError.badRequest('One or more categories were not found');
  }

  if (categories.some((category) => !category.isActive)) {
    throw AppError.validation('Inactive categories cannot be selected');
  }
};

const loadCategories = async (categoryIds: Types.ObjectId[], activeOnly: boolean) => {
  if (categoryIds.length === 0) {
    return [];
  }

  const filter: FilterQuery<{ _id: Types.ObjectId; isActive: boolean }> = {
    _id: { $in: categoryIds },
  };

  if (activeOnly) {
    filter.isActive = true;
  }

  const categories = await CategoryModel.find(filter).select('_id name slug').lean();
  const byId = new Map(categories.map((category) => [String(category._id), category]));

  return categoryIds.flatMap((id) => {
    const category = byId.get(String(id));

    if (!category) {
      return [];
    }

    return [{ id: String(category._id), name: category.name, slug: category.slug }];
  });
};

const assignAddress = (
  current: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  },
  patch: AddressSource,
) => {
  if (patch.line1 !== undefined) {
    current.line1 = patch.line1;
  }

  if (patch.line2 !== undefined) {
    current.line2 = patch.line2;
  }

  if (patch.city !== undefined) {
    current.city = patch.city;
  }

  if (patch.state !== undefined) {
    current.state = patch.state;
  }

  if (patch.postalCode !== undefined) {
    current.postalCode = patch.postalCode;
  }

  if (patch.country !== undefined) {
    current.country = patch.country;
  }
};

const findOwnStore = async (userId: string) => {
  const store = await StoreModel.findOne({ userId });

  if (!store) {
    throw AppError.notFound('Store not found');
  }

  return store;
};

const mapStoreDuplicate = (error: unknown) => {
  if (!isDuplicateKeyError(error)) {
    return error;
  }

  const fields = duplicateKeyFields(error);

  if (fields.some((field) => field.includes('slug'))) {
    return AppError.conflict('A store with this slug already exists');
  }

  return AppError.conflict('This account already has a store');
};

const mapPayoutDuplicate = (error: unknown) => {
  if (!isDuplicateKeyError(error)) {
    return error;
  }

  return AppError.conflict('This store already has a payout account');
};

const writePayout = async (store: HydratedDocument<Store>, input: SaveStorePayoutInput) => {
  const existing = await StorePayoutModel.findOne({ userId: store.userId });
  const payout =
    existing ??
    new StorePayoutModel({
      userId: store.userId,
      storeId: store._id,
    });

  payout.method = input.method;
  payout.accountHolderName = input.accountHolderName;
  payout.accountNumber = input.accountNumber;

  if (input.method === 'bank') {
    payout.bankName = input.bankName;
    payout.branchName = input.branchName;
    payout.routingNumber = input.routingNumber ?? '';
    payout.provider = '';
  } else {
    payout.provider = input.provider;
    payout.bankName = '';
    payout.branchName = '';
    payout.routingNumber = '';
  }

  try {
    await payout.save();
  } catch (error) {
    throw mapPayoutDuplicate(error);
  }
};

const vendorView = async (store: Store) => {
  const [categories, payout] = await Promise.all([
    loadCategories(store.categoryIds, false),
    StorePayoutModel.findOne({ userId: store.userId }),
  ]);

  return toVendorDto(store, categories, payout);
};

export const storeService = {
  async ensureForVendor(seed: StoreSeed) {
    const existing = await StoreModel.findOne({ userId: seed.userId }).select('_id');

    if (existing) {
      return { created: false };
    }

    const slug = await resolveSlug(undefined, seed.name);

    try {
      await StoreModel.create({
        userId: seed.userId,
        name: seed.name,
        slug,
        description: seed.description,
        contact: {
          email: seed.email,
          phone: seed.phone,
        },
        address: seed.address,
        categoryIds: seed.categoryIds.map((id) => new Types.ObjectId(id)),
        joinedAt: new Date(),
      });

      return { created: true };
    } catch (error) {
      if (
        isDuplicateKeyError(error) &&
        duplicateKeyFields(error).some((field) => field === 'userId')
      ) {
        return { created: false };
      }

      throw mapStoreDuplicate(error);
    }
  },

  async removeForVendor(userId: string) {
    await StorePayoutModel.deleteOne({ userId });
    await StoreModel.deleteOne({ userId });
  },

  async listPublic(query: ListStoresQuery) {
    const filter: FilterQuery<Store> = { isActive: true };

    if (query.categoryId) {
      filter.categoryIds = query.categoryId;
    }

    if (query.search) {
      filter.name = { $regex: escapeRegex(query.search), $options: 'i' };
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      StoreModel.find(filter).sort(SORTS[query.sort]).skip(skip).limit(query.limit).lean(),
      StoreModel.countDocuments(filter),
    ]);

    return {
      items: items.map((item) => toSummary(item)),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async getPublicBySlug(slug: string) {
    const store = await StoreModel.findOne({ slug, isActive: true }).lean();

    if (!store) {
      throw AppError.notFound('Store not found');
    }

    const categories = await loadCategories(store.categoryIds, true);

    return toPublicDto(store, categories);
  },

  async getPublicById(id: string) {
    const store = await StoreModel.findOne({ _id: id, isActive: true }).lean();

    if (!store) {
      throw AppError.notFound('Store not found');
    }

    const categories = await loadCategories(store.categoryIds, true);

    return toPublicDto(store, categories);
  },

  async getMine(userId: string) {
    const store = await findOwnStore(userId);

    return vendorView(store);
  },

  async updateMine(userId: string, input: UpdateStoreInput) {
    const store = await findOwnStore(userId);

    if (input.name !== undefined) {
      store.name = input.name;
    }

    if (input.slug !== undefined) {
      store.slug = await resolveSlug(input.slug, store.name, String(store._id));
    }

    if (input.logo !== undefined) {
      store.logo = input.logo;
    }

    if (input.banner !== undefined) {
      store.banner = input.banner;
    }

    if (input.description !== undefined) {
      store.description = input.description;
    }

    if (input.contact?.email !== undefined) {
      store.contact.email = input.contact.email;
    }

    if (input.contact?.phone !== undefined) {
      store.contact.phone = input.contact.phone;
    }

    if (input.address) {
      assignAddress(store.address, input.address);
    }

    if (input.categoryIds !== undefined) {
      await assertCategories(input.categoryIds);
      store.categoryIds = input.categoryIds.map((id) => new Types.ObjectId(id));
    }

    if (input.returnPolicy !== undefined) {
      store.returnPolicy = input.returnPolicy;
    }

    if (input.shippingPolicy !== undefined) {
      store.shippingPolicy = input.shippingPolicy;
    }

    if (input.isActive !== undefined) {
      store.isActive = input.isActive;
    }

    try {
      await store.save();
    } catch (error) {
      throw mapStoreDuplicate(error);
    }

    if (input.payout) {
      await writePayout(store, input.payout);
    }

    return vendorView(store);
  },
};
