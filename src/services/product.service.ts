import { Types, type FilterQuery, type HydratedDocument } from 'mongoose';
import { MAX_PRODUCT_IMAGES } from '../constants/product';
import { Permission, roleHasPermission } from '../constants/permissions';
import { attributeService } from './attribute.service';
import { imageStorage } from './imageStorage';
import {
  assertRequiredProductAttributes,
  normalizeProductAttributes,
  type ProductAttributeInput,
} from './productAttributes';
import { AttributeModel } from '../models/attribute.model';
import { CategoryAttributeModel } from '../models/categoryAttribute.model';
import { CategoryModel } from '../models/category.model';
import { ProductModel, type Product } from '../models/product.model';

type ProductDocument = HydratedDocument<Product>;
import { StoreModel } from '../models/store.model';
import type { AttributeRole, AttributeType } from '../types/attribute';
import type {
  ImageProvider,
  ProductApprovalStatus,
  ProductDto,
  ProductOfferDto,
  ProductStatus,
  ProductViewer,
} from '../types/product';
import { variantService } from './variant.service';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { duplicateKeyFields, isDuplicateKeyError } from '../utils/mongoError';
import { escapeRegex, slugify } from '../utils/slugify';
import type {
  CreateProductInput,
  ListManageProductsQuery,
  ListMineProductsQuery,
  ListPublicProductsQuery,
  UpdateProductInput,
} from '../validators/product.validator';

type ImageSource = {
  id: string;
  provider: string;
  storageKey: string;
  url: string;
  mimeType: string;
  size: number;
  alt: string;
  sortOrder: number;
};

type AttributeSource = {
  attributeId: Types.ObjectId;
  text: string;
  number: number | null;
  boolean: boolean | null;
  optionIds: Types.ObjectId[];
};

type ProductSource = {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  categoryId: Types.ObjectId;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  images: ImageSource[];
  thumbnailId: string;
  attributes: AttributeSource[];
  tags: string[];
  status: string;
  approvalStatus: string;
  reviewNote: string;
  isFeatured: boolean;
  isPublished: boolean;
  ratingSummary: { average: number; count: number };
  createdAt: Date;
  updatedAt: Date;
};

type ProductSort = ListPublicProductsQuery['sort'];

type PageQuery = {
  page: number;
  limit: number;
  sort: ProductSort;
  search?: string;
};

const SORTS: Record<ProductSort, Record<string, 1 | -1>> = {
  name: { name: 1 },
  '-name': { name: -1 },
  createdAt: { createdAt: 1 },
  '-createdAt': { createdAt: -1 },
  rating: { 'ratingSummary.average': 1 },
  '-rating': { 'ratingSummary.average': -1 },
};

const isListed = (product: { status: string; isPublished: boolean; approvalStatus: string }) =>
  product.approvalStatus === 'approved' && product.status === 'active' && product.isPublished;

const toStatus = (status: string): ProductStatus => {
  if (status === 'active' || status === 'archived') {
    return status;
  }

  throw AppError.internal('Stored product status is invalid');
};

const toApprovalStatus = (status: string): ProductApprovalStatus => {
  if (
    status === 'pending' ||
    status === 'submitted' ||
    status === 'approved' ||
    status === 'rejected'
  ) {
    return status;
  }

  throw AppError.internal('Stored product approval status is invalid');
};

const toProvider = (provider: string): ImageProvider => {
  if (provider === 'local') {
    return provider;
  }

  throw AppError.internal('Stored image provider is invalid');
};

const toAttributeType = (type: string): AttributeType => {
  if (
    type === 'text' ||
    type === 'number' ||
    type === 'boolean' ||
    type === 'select' ||
    type === 'multiselect'
  ) {
    return type;
  }

  throw AppError.internal('Stored attribute type is invalid');
};

const toAttributeRole = (role: string): AttributeRole => {
  if (role === 'spec' || role === 'variant') {
    return role;
  }

  throw AppError.internal('Stored attribute role is invalid');
};

const slugTaken = async (slug: string, excludeId?: string) => {
  const filter: FilterQuery<Product> = { slug };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  return ProductModel.exists(filter);
};

const resolveSlug = async (requested: string | undefined, name: string, excludeId?: string) => {
  const base = slugify(requested ?? name);

  if (base.length < 2) {
    throw AppError.validation('Could not generate a valid slug from the product name');
  }

  if (requested) {
    if (await slugTaken(base, excludeId)) {
      throw AppError.conflict('A product with this slug already exists');
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

  throw AppError.conflict('A product with this slug already exists');
};

const mapDuplicate = (error: unknown) => {
  if (!isDuplicateKeyError(error)) {
    return error;
  }

  if (duplicateKeyFields(error).some((field) => field.includes('slug'))) {
    return AppError.conflict('A product with this slug already exists');
  }

  return AppError.conflict('A product with this value already exists');
};

const uniqueTags = (tags: string[]) => {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const tag of tags) {
    if (seen.has(tag)) {
      continue;
    }

    seen.add(tag);
    unique.push(tag);
  }

  return unique;
};

const findVendorStore = async (userId: string) => {
  const store = await StoreModel.findOne({ userId }).select('_id userId isActive categoryIds');

  if (!store) {
    throw AppError.notFound('Store not found');
  }

  return store;
};

const findOwnedProduct = async (userId: string, productId: string) => {
  const store = await findVendorStore(userId);
  const product = await ProductModel.findOne({ _id: productId, storeId: store._id });

  if (!product) {
    throw AppError.notFound('Product not found');
  }

  return product;
};

const assertCategory = async (categoryId: string, storeCategoryIds: Types.ObjectId[]) => {
  if (storeCategoryIds.length === 0) {
    throw AppError.validation('Choose store categories before adding products');
  }

  const category = await CategoryModel.findById(categoryId).select('_id isActive ancestors');

  if (!category) {
    throw AppError.badRequest('Category not found');
  }

  if (!category.isActive) {
    throw AppError.validation('Inactive categories cannot be used');
  }

  const allowed = new Set(storeCategoryIds.map((id) => String(id)));
  const inStore =
    allowed.has(String(category._id)) ||
    category.ancestors.some((ancestor) => allowed.has(String(ancestor)));

  if (!inStore) {
    throw AppError.validation('Choose a category your store sells');
  }

  return category;
};

const storedAttributesToInput = (attributes: AttributeSource[]): ProductAttributeInput[] =>
  attributes.map((attribute) => ({
    attributeId: String(attribute.attributeId),
    ...(attribute.text ? { text: attribute.text } : {}),
    ...(attribute.number !== null ? { number: attribute.number } : {}),
    ...(attribute.boolean !== null ? { boolean: attribute.boolean } : {}),
    ...(attribute.optionIds.length > 0
      ? { optionIds: attribute.optionIds.map((optionId) => String(optionId)) }
      : {}),
  }));

const syncThumbnail = (product: ProductDocument) => {
  const ids = product.images.map((image) => image.imageId);
  const current = ids.find((id) => id === product.thumbnailId);

  product.thumbnailId = current ?? ids[0] ?? '';
};

const resequence = (product: { images: { sortOrder: number }[] }) => {
  product.images.forEach((image, index) => {
    image.sortOrder = index;
  });
};

const assertSellable = async (product: ProductSource) => {
  if (product.status !== 'active') {
    return;
  }

  const hasThumbnail = product.images.some((image) => image.id === product.thumbnailId);

  if (product.images.length < 1 || !hasThumbnail) {
    throw AppError.validation('Add at least one image');
  }

  const assignments = await attributeService.listForCategory(String(product.categoryId));

  if (product.attributes.length > 0) {
    normalizeProductAttributes(storedAttributesToInput(product.attributes), assignments);
  }

  assertRequiredProductAttributes(product.attributes, assignments);
};

type ImageUpload = {
  buffer: Buffer;
  mimeType: string;
};

const discardImages = async (images: { storageKey: string }[]) => {
  await Promise.all(
    images.map((image) => imageStorage.remove(image.storageKey).catch(() => undefined)),
  );
};

const storeImages = async (product: ProductDocument, files: ImageUpload[]) => {
  if (product.images.length + files.length > MAX_PRODUCT_IMAGES) {
    throw AppError.validation(`A product can have at most ${MAX_PRODUCT_IMAGES} images`);
  }

  const saved = [];

  try {
    for (const file of files) {
      saved.push(await imageStorage.save(file));
    }

    for (const image of saved) {
      product.images.push({
        imageId: image.id,
        provider: image.provider,
        storageKey: image.storageKey,
        url: image.url,
        mimeType: image.mimeType,
        size: image.size,
        alt: '',
        sortOrder: product.images.length,
      });
    }

    resequence(product);
    syncThumbnail(product);
    return saved;
  } catch (error) {
    await discardImages(saved);
    throw error;
  }
};

const adjustProductCount = async (storeId: Types.ObjectId, delta: number) => {
  if (delta === 0) {
    return;
  }

  await StoreModel.updateOne(
    delta < 0 ? { _id: storeId, totalProducts: { $gte: -delta } } : { _id: storeId },
    { $inc: { totalProducts: delta } },
  );
};

const deleteStoredImage = async (image: { provider: string; storageKey: string }) => {
  if (image.provider !== 'local') {
    return;
  }

  try {
    await imageStorage.remove(image.storageKey);
  } catch (error) {
    logger.warn('Failed to delete a product image file', { err: error });
  }
};

const readProduct = (product: ProductDocument): ProductSource => {
  const plain = product.toObject();

  return {
    _id: product._id,
    storeId: product.storeId,
    categoryId: product.categoryId,
    name: plain.name,
    slug: plain.slug,
    shortDescription: plain.shortDescription ?? '',
    description: plain.description ?? '',
    images: (plain.images ?? []).map((image) => ({
      id: image.imageId,
      provider: image.provider,
      storageKey: image.storageKey,
      url: image.url,
      mimeType: image.mimeType,
      size: image.size,
      alt: image.alt ?? '',
      sortOrder: image.sortOrder ?? 0,
    })),
    thumbnailId: plain.thumbnailId ?? '',
    attributes: (plain.attributes ?? []).map((attribute) => ({
      attributeId: attribute.attributeId,
      text: attribute.text ?? '',
      number: attribute.number ?? null,
      boolean: attribute.boolean ?? null,
      optionIds: attribute.optionIds ?? [],
    })),
    tags: [...(plain.tags ?? [])],
    status: plain.status,
    approvalStatus: plain.approvalStatus ?? 'pending',
    reviewNote: plain.reviewNote ?? '',
    isFeatured: plain.isFeatured,
    isPublished: plain.isPublished,
    ratingSummary: {
      average: plain.ratingSummary?.average ?? 0,
      count: plain.ratingSummary?.count ?? 0,
    },
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
};

const applyAttributes = async (
  product: ProductDocument,
  input: ProductAttributeInput[] | undefined,
) => {
  if (input === undefined) {
    return;
  }

  const assignments = await attributeService.listForCategory(String(product.categoryId));
  const normalized = normalizeProductAttributes(input, assignments);
  product.set('attributes', normalized);
};

const mapProducts = async (products: ProductSource[]): Promise<ProductDto[]> => {
  if (products.length === 0) {
    return [];
  }

  const storeIds = [...new Set(products.map((product) => String(product.storeId)))];
  const categoryIds = [...new Set(products.map((product) => String(product.categoryId)))];
  const attributeIds = [
    ...new Set(
      products.flatMap((product) =>
        product.attributes.map((attribute) => String(attribute.attributeId)),
      ),
    ),
  ];
  const optionIds = products.flatMap((product) =>
    product.attributes.flatMap((attribute) => attribute.optionIds),
  );

  const offers = await variantService.offersFor(products.map((product) => String(product._id)));
  const [stores, categories, attributes, optionRows] = await Promise.all([
    StoreModel.find({ _id: { $in: storeIds } })
      .select('name slug')
      .lean(),
    CategoryModel.find({ _id: { $in: categoryIds } })
      .select('name slug')
      .lean(),
    attributeIds.length > 0
      ? AttributeModel.find({ _id: { $in: attributeIds } })
          .select('name slug type role unit')
          .lean()
      : Promise.resolve([]),
    optionIds.length > 0
      ? CategoryAttributeModel.find({ 'options._id': { $in: optionIds } })
          .select('options')
          .lean()
      : Promise.resolve([]),
  ]);

  const storesById = new Map(stores.map((store) => [String(store._id), store]));
  const categoriesById = new Map(categories.map((category) => [String(category._id), category]));
  const attributesById = new Map(attributes.map((attribute) => [String(attribute._id), attribute]));
  const optionsById = new Map<string, { id: string; label: string; value: string }>();

  for (const row of optionRows) {
    for (const option of row.options ?? []) {
      optionsById.set(String(option._id), {
        id: String(option._id),
        label: option.label,
        value: option.value,
      });
    }
  }

  return products.map((product) => {
    const images = [...product.images]
      .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
      .map((image) => ({
        id: image.id,
        provider: toProvider(image.provider),
        url: image.url,
        mimeType: image.mimeType,
        size: image.size,
        alt: image.alt,
        sortOrder: image.sortOrder,
      }));
    const store = storesById.get(String(product.storeId));
    const category = categoriesById.get(String(product.categoryId));

    return {
      id: String(product._id),
      storeId: String(product.storeId),
      categoryId: String(product.categoryId),
      store: {
        id: String(product.storeId),
        name: store?.name ?? '',
        slug: store?.slug ?? '',
      },
      category: {
        id: String(product.categoryId),
        name: category?.name ?? '',
        slug: category?.slug ?? '',
      },
      name: product.name,
      slug: product.slug,
      shortDescription: product.shortDescription,
      description: product.description,
      images,
      thumbnail: images.find((image) => image.id === product.thumbnailId) ?? null,
      offer: offers.get(String(product._id)) ?? emptyOffer(),
      attributes: product.attributes.map((attribute) => {
        const meta = attributesById.get(String(attribute.attributeId));
        const type = meta ? toAttributeType(meta.type) : 'text';
        const options = attribute.optionIds.map(
          (optionId) =>
            optionsById.get(String(optionId)) ?? {
              id: String(optionId),
              label: '',
              value: '',
            },
        );

        return {
          attributeId: String(attribute.attributeId),
          name: meta?.name ?? '',
          slug: meta?.slug ?? '',
          type,
          role: meta ? toAttributeRole(meta.role) : 'spec',
          unit: meta?.unit ?? '',
          text: type === 'text' ? attribute.text : null,
          number: type === 'number' ? attribute.number : null,
          boolean: type === 'boolean' ? attribute.boolean : null,
          options: type === 'select' || type === 'multiselect' ? options : [],
        };
      }),
      tags: [...product.tags],
      status: toStatus(product.status),
      approvalStatus: toApprovalStatus(product.approvalStatus),
      reviewNote: product.reviewNote,
      isFeatured: product.isFeatured,
      isPublished: product.isPublished,
      ratingSummary: {
        average: product.ratingSummary.average,
        count: product.ratingSummary.count,
      },
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  });
};

const emptyOffer = (): ProductOfferDto => variantService.emptyOffer();

const present = async (product: ProductDocument) => {
  const [dto] = await mapProducts([readProduct(product)]);

  if (!dto) {
    throw AppError.internal('Product could not be loaded');
  }

  return dto;
};

const ensureVisible = async (product: ProductDocument, viewer?: ProductViewer) => {
  const store = await StoreModel.findById(product.storeId).select('userId isActive');
  const visible = isListed(product) && Boolean(store?.isActive);

  if (visible) {
    return;
  }

  if (viewer && roleHasPermission(viewer.role, Permission.adminProductModeration)) {
    return;
  }

  if (viewer && store && String(store.userId) === viewer.id) {
    return;
  }

  throw AppError.notFound('Product not found');
};

const applySearch = (filter: FilterQuery<Product>, search?: string) => {
  if (!search) {
    return;
  }

  const pattern = { $regex: escapeRegex(search), $options: 'i' };

  filter.$or = [{ name: pattern }, { shortDescription: pattern }, { tags: pattern }];
};

const applyCategory = async (filter: FilterQuery<Product>, categoryId?: string) => {
  if (!categoryId) {
    return;
  }

  const category = await CategoryModel.findById(categoryId).select('_id');

  if (!category) {
    throw AppError.notFound('Category not found');
  }

  const children = await CategoryModel.find({ ancestors: category._id }).select('_id');
  filter.categoryId = { $in: [category._id, ...children.map((child) => child._id)] };
};

const runList = async (filter: FilterQuery<Product>, query: PageQuery) => {
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    ProductModel.find(filter).sort(SORTS[query.sort]).skip(skip).limit(query.limit),
    ProductModel.countDocuments(filter),
  ]);

  return {
    items: await mapProducts(items.map((item) => readProduct(item))),
    page: query.page,
    limit: query.limit,
    total,
  };
};

const emptyPage = (query: PageQuery) => ({
  items: [],
  page: query.page,
  limit: query.limit,
  total: 0,
});

const publishState = (
  current: { status: string; isPublished: boolean; approvalStatus: string },
  input: { status?: ProductStatus; isPublished?: boolean },
) => {
  const nextStatus = input.status ?? toStatus(current.status);
  let nextPublished = input.isPublished ?? current.isPublished;

  if (input.isPublished === true && nextStatus !== 'active') {
    throw AppError.validation('Only active products can be published');
  }

  if (input.isPublished === true && current.approvalStatus !== 'approved') {
    throw AppError.validation('This product must be approved before it can be shown');
  }

  if (nextStatus !== 'active') {
    nextPublished = false;
  }

  return { nextStatus, nextPublished };
};

const assertVendorCanChange = (product: { approvalStatus: string }) => {
  if (product.approvalStatus === 'submitted') {
    throw AppError.conflict('This product is waiting for admin approval');
  }
};

export const productService = {
  async create(userId: string, input: CreateProductInput, files: ImageUpload[]) {
    if (files.length < 1) {
      throw AppError.validation('Choose at least one image');
    }

    const store = await findVendorStore(userId);
    await assertCategory(input.categoryId, store.categoryIds);
    const { nextStatus, nextPublished } = publishState(
      { status: 'active', isPublished: false, approvalStatus: 'pending' },
      input,
    );
    const slug = await resolveSlug(input.slug, input.name);

    const product = new ProductModel({
      storeId: store._id,
      categoryId: input.categoryId,
      name: input.name,
      slug,
      shortDescription: input.shortDescription ?? '',
      description: input.description ?? '',
      tags: uniqueTags(input.tags ?? []),
      status: nextStatus,
      approvalStatus: 'pending',
      reviewNote: '',
      isPublished: nextPublished,
      isFeatured: false,
      images: [],
      thumbnailId: '',
      ratingSummary: { average: 0, count: 0 },
    });

    const saved = await storeImages(product, files);

    try {
      await applyAttributes(product, input.attributes);
      await assertSellable(readProduct(product));
      await product.save();
    } catch (error) {
      await discardImages(saved);
      throw mapDuplicate(error);
    }

    if (isListed(product)) {
      await adjustProductCount(store._id, 1);
    }

    return present(product);
  },

  async update(userId: string, productId: string, input: UpdateProductInput) {
    const product = await findOwnedProduct(userId, productId);
    assertVendorCanChange(product);
    const wasListed = isListed(product);

    if (input.name !== undefined) {
      product.name = input.name;
    }

    if (input.slug !== undefined) {
      product.slug = await resolveSlug(input.slug, product.name, String(product._id));
    }

    if (input.shortDescription !== undefined) {
      product.shortDescription = input.shortDescription;
    }

    if (input.description !== undefined) {
      product.description = input.description;
    }

    if (input.tags !== undefined) {
      product.tags = uniqueTags(input.tags);
    }

    if (input.categoryId !== undefined) {
      const store = await findVendorStore(userId);
      await assertCategory(input.categoryId, store.categoryIds);
      product.categoryId = new Types.ObjectId(input.categoryId);
      await variantService.assertMatchesCategory(product._id, input.categoryId);
    }

    if (input.attributes !== undefined) {
      await applyAttributes(product, input.attributes);
    } else if (input.categoryId !== undefined) {
      const source = readProduct(product);
      await applyAttributes(product, storedAttributesToInput(source.attributes));
    }

    const { nextStatus, nextPublished } = publishState(product, input);
    product.status = nextStatus;
    product.isPublished = nextPublished;
    syncThumbnail(product);

    await assertSellable(readProduct(product));

    if (nextPublished) {
      await variantService.assertSellable(String(product._id));
    }

    try {
      await product.save();
    } catch (error) {
      throw mapDuplicate(error);
    }

    const listed = isListed(product);
    await adjustProductCount(product.storeId, Number(listed) - Number(wasListed));

    return present(product);
  },

  async remove(userId: string, productId: string) {
    const product = await findOwnedProduct(userId, productId);
    const wasListed = isListed(product);
    const images = product.images.map((image) => ({
      provider: image.provider,
      storageKey: image.storageKey,
    }));

    await variantService.removeForProduct(product._id);
    await product.deleteOne();

    if (wasListed) {
      await adjustProductCount(product.storeId, -1);
    }

    await Promise.all(images.map((image) => deleteStoredImage(image)));

    return { id: String(product._id) };
  },

  async addImages(
    userId: string,
    productId: string,
    files: { buffer: Buffer; mimeType: string }[],
  ) {
    if (files.length < 1) {
      throw AppError.validation('Choose at least one image');
    }

    const product = await findOwnedProduct(userId, productId);
    assertVendorCanChange(product);
    const saved = await storeImages(product, files);

    try {
      await product.save();
    } catch (error) {
      await discardImages(saved);
      throw error;
    }

    return present(product);
  },

  async removeImage(userId: string, productId: string, imageId: string) {
    const product = await findOwnedProduct(userId, productId);
    assertVendorCanChange(product);
    const index = product.images.findIndex((image) => image.imageId === imageId);
    const image = product.images[index];

    if (!image) {
      throw AppError.notFound('Image not found');
    }

    const removed = {
      provider: image.provider,
      storageKey: image.storageKey,
    };

    product.images.splice(index, 1);
    resequence(product);
    syncThumbnail(product);
    await assertSellable(readProduct(product));
    await product.save();
    await variantService.detachImage(product._id, imageId);
    await deleteStoredImage(removed);

    return present(product);
  },

  async setThumbnail(userId: string, productId: string, imageId: string) {
    const product = await findOwnedProduct(userId, productId);
    assertVendorCanChange(product);
    const image = product.images.find((item) => item.imageId === imageId);

    if (!image) {
      throw AppError.notFound('Image not found');
    }

    product.thumbnailId = image.imageId;
    await product.save();

    return present(product);
  },

  async submit(userId: string, productId: string) {
    const product = await findOwnedProduct(userId, productId);

    if (product.approvalStatus !== 'pending' && product.approvalStatus !== 'rejected') {
      throw AppError.conflict('Only a new or rejected product can be submitted');
    }

    if (product.status !== 'active') {
      throw AppError.validation('Archived products cannot be submitted');
    }

    await assertSellable(readProduct(product));
    await variantService.assertSellable(String(product._id));
    product.approvalStatus = 'submitted';
    product.reviewNote = '';
    product.isPublished = false;
    product.isFeatured = false;
    await product.save();

    return present(product);
  },

  async approve(productId: string, note?: string) {
    const product = await ProductModel.findById(productId);

    if (!product) {
      throw AppError.notFound('Product not found');
    }

    if (product.approvalStatus !== 'submitted') {
      throw AppError.conflict('Only a submitted product can be approved');
    }

    if (product.status !== 'active') {
      throw AppError.validation('Archived products cannot be approved');
    }

    await assertSellable(readProduct(product));
    await variantService.assertSellable(String(product._id));
    const wasListed = isListed(product);
    product.approvalStatus = 'approved';
    product.isPublished = true;
    product.reviewNote = note ?? '';
    await product.save();

    if (!wasListed && isListed(product)) {
      await adjustProductCount(product.storeId, 1);
    }

    return present(product);
  },

  async reject(productId: string, note: string) {
    const product = await ProductModel.findById(productId);

    if (!product) {
      throw AppError.notFound('Product not found');
    }

    if (product.approvalStatus !== 'submitted') {
      throw AppError.conflict('Only a submitted product can be rejected');
    }

    const wasListed = isListed(product);
    product.approvalStatus = 'rejected';
    product.isPublished = false;
    product.isFeatured = false;
    product.reviewNote = note;
    await product.save();

    if (wasListed) {
      await adjustProductCount(product.storeId, -1);
    }

    return present(product);
  },

  async setFeatured(productId: string, isFeatured: boolean) {
    const product = await ProductModel.findById(productId);

    if (!product) {
      throw AppError.notFound('Product not found');
    }

    if (isFeatured && !isListed(product)) {
      throw AppError.validation('Only an approved visible product can be featured');
    }

    product.isFeatured = isFeatured;
    await product.save();

    return present(product);
  },

  async listPublic(query: ListPublicProductsQuery) {
    const filter: FilterQuery<Product> = {
      approvalStatus: 'approved',
      status: 'active',
      isPublished: true,
    };

    if (query.storeId) {
      const store = await StoreModel.findById(query.storeId).select('_id isActive');

      if (!store) {
        throw AppError.notFound('Store not found');
      }

      if (!store.isActive) {
        return emptyPage(query);
      }

      filter.storeId = store._id;
    } else {
      const storeIds = await StoreModel.find({ isActive: true }).distinct('_id');
      filter.storeId = { $in: storeIds };
    }

    if (query.tag) {
      const tag = slugify(query.tag);

      if (tag.length < 2) {
        return emptyPage(query);
      }

      filter.tags = tag;
    }

    if (query.isFeatured !== undefined) {
      filter.isFeatured = query.isFeatured;
    }

    applySearch(filter, query.search);
    await applyCategory(filter, query.categoryId);

    return runList(filter, query);
  },

  async listMine(userId: string, query: ListMineProductsQuery) {
    const store = await findVendorStore(userId);
    const filter: FilterQuery<Product> = { storeId: store._id };

    if (query.status) {
      filter.status = query.status;
    }

    if (query.approvalStatus) {
      filter.approvalStatus = query.approvalStatus;
    }

    if (query.isPublished !== undefined) {
      filter.isPublished = query.isPublished;
    }

    applySearch(filter, query.search);

    return runList(filter, query);
  },

  async listForModeration(query: ListManageProductsQuery) {
    const filter: FilterQuery<Product> = {};

    if (query.storeId) {
      const store = await StoreModel.exists({ _id: query.storeId });

      if (!store) {
        throw AppError.notFound('Store not found');
      }

      filter.storeId = query.storeId;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.approvalStatus) {
      filter.approvalStatus = query.approvalStatus;
    }

    if (query.isPublished !== undefined) {
      filter.isPublished = query.isPublished;
    }

    if (query.isFeatured !== undefined) {
      filter.isFeatured = query.isFeatured;
    }

    applySearch(filter, query.search);
    await applyCategory(filter, query.categoryId);

    return runList(filter, query);
  },

  async getById(id: string, viewer?: ProductViewer) {
    const product = await ProductModel.findById(id);

    if (!product) {
      throw AppError.notFound('Product not found');
    }

    await ensureVisible(product, viewer);

    return present(product);
  },

  async getBySlug(slug: string, viewer?: ProductViewer) {
    const product = await ProductModel.findOne({ slug });

    if (!product) {
      throw AppError.notFound('Product not found');
    }

    await ensureVisible(product, viewer);

    return present(product);
  },
};
