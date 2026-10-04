import { Types, type HydratedDocument } from 'mongoose';
import { Permission, roleHasPermission } from '../constants/permissions';
import { AttributeModel } from '../models/attribute.model';
import { CategoryAttributeModel } from '../models/categoryAttribute.model';
import { ProductModel, type Product } from '../models/product.model';
import { ProductVariantModel, type ProductVariant } from '../models/productVariant.model';
import { StoreModel } from '../models/store.model';
import { attributeService } from './attribute.service';
import {
  normalizeVariantAttributes,
  variantOptionKey,
  type StoredVariantAttribute,
  type VariantAttributeInput,
} from './variantAttributes';
import type { AttributeRole, AttributeType } from '../types/attribute';
import type { ImageProvider, ProductOfferDto, ProductViewer } from '../types/product';
import type { VariantDto, VariantStatus } from '../types/variant';
import { AppError } from '../utils/AppError';
import { duplicateKeyFields, isDuplicateKeyError } from '../utils/mongoError';
import type {
  CreateVariantInput,
  ListVariantsQuery,
  UpdateVariantInput,
} from '../validators/variant.validator';

type ProductDocument = HydratedDocument<Product>;
type VariantDocument = HydratedDocument<ProductVariant>;

type VariantSort = ListVariantsQuery['sort'];

type ImageSource = {
  id: string;
  provider: string;
  url: string;
  mimeType: string;
  size: number;
  alt: string;
  sortOrder: number;
};

type VariantSource = {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  imageId: string;
  attributes: StoredVariantAttribute[];
  status: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const SORTS: Record<VariantSort, Record<string, 1 | -1>> = {
  createdAt: { createdAt: 1 },
  '-createdAt': { createdAt: -1 },
  price: { price: 1 },
  '-price': { price: -1 },
  sku: { sku: 1 },
  '-sku': { sku: -1 },
  stock: { stock: 1 },
  '-stock': { stock: -1 },
};

const emptyOffer = (): ProductOfferDto => ({
  minPrice: null,
  maxPrice: null,
  inStock: false,
  variantCount: 0,
  defaultVariantId: null,
});

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const toStatus = (status: string): VariantStatus => {
  if (status === 'active' || status === 'archived') {
    return status;
  }

  throw AppError.internal('Stored variant status is invalid');
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

const toProvider = (provider: string): ImageProvider => {
  if (provider === 'local') {
    return provider;
  }

  throw AppError.internal('Stored image provider is invalid');
};

const mapDuplicate = (error: unknown) => {
  if (!isDuplicateKeyError(error)) {
    return error;
  }

  const fields = duplicateKeyFields(error);

  if (fields.includes('sku')) {
    return AppError.conflict('A variant with this SKU already exists');
  }

  if (fields.includes('optionKey')) {
    return AppError.conflict('A variant with these options already exists');
  }

  if (fields.includes('productId')) {
    return AppError.conflict('This product already has a default variant');
  }

  return AppError.conflict('A variant with this value already exists');
};

const assertPrice = (price: number, compareAtPrice: number | null) => {
  if (compareAtPrice !== null && compareAtPrice <= price) {
    throw AppError.validation('Compare-at price must be higher than the selling price');
  }
};

const storedToInput = (
  attributes: {
    attributeId: { toString(): string };
    text: string;
    number: number | null;
    optionIds: { toString(): string }[];
  }[],
): VariantAttributeInput[] =>
  attributes.map((attribute) => ({
    attributeId: String(attribute.attributeId),
    ...(attribute.text ? { text: attribute.text } : {}),
    ...(attribute.number !== null ? { number: attribute.number } : {}),
    ...(attribute.optionIds.length > 0
      ? { optionIds: attribute.optionIds.map((optionId) => String(optionId)) }
      : {}),
  }));

const productImages = (product: ProductDocument): ImageSource[] =>
  product.images.map((image) => ({
    id: image.imageId,
    provider: image.provider,
    url: image.url,
    mimeType: image.mimeType,
    size: image.size,
    alt: image.alt ?? '',
    sortOrder: image.sortOrder ?? 0,
  }));

const assertImage = (imageId: string, images: ImageSource[]) => {
  if (!imageId) {
    return;
  }

  if (!images.some((image) => image.id === imageId)) {
    throw AppError.validation('Choose an image that belongs to this product');
  }
};

const requiresActiveVariant = (product: { isPublished: boolean; approvalStatus: string }) =>
  product.isPublished || product.approvalStatus === 'submitted';

const assertVendorCanChange = (product: { approvalStatus: string }) => {
  if (product.approvalStatus === 'submitted') {
    throw AppError.conflict('This product is waiting for admin approval');
  }
};

const findOwnedProduct = async (userId: string, productId: string) => {
  const store = await StoreModel.findOne({ userId }).select('_id');

  if (!store) {
    throw AppError.notFound('Store not found');
  }

  const product = await ProductModel.findOne({ _id: productId, storeId: store._id });

  if (!product) {
    throw AppError.notFound('Product not found');
  }

  return product;
};

const accessFor = async (product: ProductDocument, viewer?: ProductViewer) => {
  const store = await StoreModel.findById(product.storeId).select('userId isActive');
  const listed =
    product.approvalStatus === 'approved' &&
    product.status === 'active' &&
    product.isPublished &&
    Boolean(store?.isActive);
  const canManage =
    Boolean(viewer && roleHasPermission(viewer.role, Permission.adminProductModeration)) ||
    Boolean(viewer && store && String(store.userId) === viewer.id);

  if (listed) {
    return canManage ? 'manage' : 'public';
  }

  if (canManage) {
    return 'manage';
  }

  throw AppError.notFound('Product not found');
};

const readVariant = (variant: VariantDocument): VariantSource => {
  const plain = variant.toObject();

  return {
    _id: variant._id,
    productId: variant.productId,
    sku: plain.sku,
    price: plain.price,
    compareAtPrice: plain.compareAtPrice ?? null,
    stock: plain.stock,
    imageId: plain.imageId ?? '',
    attributes: (plain.attributes ?? []).map((attribute) => ({
      attributeId: attribute.attributeId,
      text: attribute.text ?? '',
      number: attribute.number ?? null,
      optionIds: attribute.optionIds ?? [],
    })),
    status: plain.status,
    isDefault: plain.isDefault,
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
  };
};

const mapVariants = async (
  variants: VariantSource[],
  images: ImageSource[],
): Promise<VariantDto[]> => {
  if (variants.length === 0) {
    return [];
  }

  const attributeIds = [
    ...new Set(
      variants.flatMap((variant) =>
        variant.attributes.map((attribute) => String(attribute.attributeId)),
      ),
    ),
  ];
  const optionIds = variants.flatMap((variant) =>
    variant.attributes.flatMap((attribute) => attribute.optionIds),
  );
  const [attributes, optionRows] = await Promise.all([
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

  const imagesById = new Map(images.map((image) => [image.id, image]));

  return variants.map((variant) => {
    const image = imagesById.get(variant.imageId);

    return {
      id: String(variant._id),
      productId: String(variant.productId),
      sku: variant.sku,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      stock: variant.stock,
      image: image
        ? {
            id: image.id,
            provider: toProvider(image.provider),
            url: image.url,
            mimeType: image.mimeType,
            size: image.size,
            alt: image.alt,
            sortOrder: image.sortOrder,
          }
        : null,
      attributes: variant.attributes.map((attribute) => {
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
          role: meta ? toAttributeRole(meta.role) : 'variant',
          unit: meta?.unit ?? '',
          text: type === 'text' ? attribute.text : null,
          number: type === 'number' ? attribute.number : null,
          boolean: null,
          options: type === 'select' ? options : [],
        };
      }),
      status: toStatus(variant.status),
      isDefault: variant.isDefault,
      createdAt: variant.createdAt.toISOString(),
      updatedAt: variant.updatedAt.toISOString(),
    };
  });
};

const present = async (variant: VariantDocument, product: ProductDocument) => {
  const [dto] = await mapVariants([readVariant(variant)], productImages(product));

  if (!dto) {
    throw AppError.internal('Variant could not be loaded');
  }

  return dto;
};

const resolveAttributes = async (
  categoryId: string,
  input: VariantAttributeInput[] | undefined,
) => {
  const assignments = await attributeService.listForCategory(categoryId);
  const normalized = normalizeVariantAttributes(input ?? [], assignments);

  return {
    attributes: normalized,
    optionKey: variantOptionKey(normalized),
  };
};

const claimDefault = async (productId: Types.ObjectId, exceptId?: Types.ObjectId) => {
  const current = await ProductVariantModel.findOne({
    productId,
    isDefault: true,
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  }).select('_id');

  if (!current) {
    return null;
  }

  await ProductVariantModel.updateOne({ _id: current._id }, { $set: { isDefault: false } });
  return current._id;
};

const restoreDefault = async (variantId: Types.ObjectId | null) => {
  if (!variantId) {
    return;
  }

  await ProductVariantModel.updateOne({ _id: variantId }, { $set: { isDefault: true } });
};

const promoteDefault = async (productId: Types.ObjectId, excludeId: Types.ObjectId) => {
  const next = await ProductVariantModel.findOne({
    productId,
    _id: { $ne: excludeId },
  }).sort({ status: 1, createdAt: 1 });

  if (!next) {
    return;
  }

  next.isDefault = true;
  await next.save();
};

const assertKeepsActiveVariant = async (
  product: ProductDocument,
  variantId: Types.ObjectId,
  nextStatus: VariantStatus,
) => {
  if (nextStatus === 'active' || !requiresActiveVariant(product)) {
    return;
  }

  const other = await ProductVariantModel.exists({
    productId: product._id,
    status: 'active',
    _id: { $ne: variantId },
  });

  if (!other) {
    throw AppError.validation(
      'Keep at least one active variant while this product is on sale or awaiting approval',
    );
  }
};

export const variantService = {
  emptyOffer,

  async offersFor(productIds: string[]) {
    const offers = new Map<string, ProductOfferDto>();

    if (productIds.length === 0) {
      return offers;
    }

    const rows = await ProductVariantModel.aggregate<{
      _id: Types.ObjectId;
      minPrice: number;
      maxPrice: number;
      variantCount: number;
      inStock: number;
      defaultVariantId: Types.ObjectId;
    }>([
      {
        $match: {
          productId: { $in: productIds.map((id) => new Types.ObjectId(id)) },
          status: 'active',
        },
      },
      { $sort: { isDefault: -1, price: 1, createdAt: 1 } },
      {
        $group: {
          _id: '$productId',
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
          variantCount: { $sum: 1 },
          inStock: { $max: { $cond: [{ $gt: ['$stock', 0] }, 1, 0] } },
          defaultVariantId: { $first: '$_id' },
        },
      },
    ]);

    for (const row of rows) {
      offers.set(String(row._id), {
        minPrice: row.minPrice,
        maxPrice: row.maxPrice,
        inStock: row.inStock === 1,
        variantCount: row.variantCount,
        defaultVariantId: String(row.defaultVariantId),
      });
    }

    return offers;
  },

  async assertSellable(productId: string) {
    const active = await ProductVariantModel.exists({ productId, status: 'active' });

    if (!active) {
      throw AppError.validation('Add at least one active variant');
    }
  },

  async assertMatchesCategory(productId: Types.ObjectId, categoryId: string) {
    const variants = await ProductVariantModel.find({ productId }).select('attributes');

    if (variants.length === 0) {
      return;
    }

    const assignments = await attributeService.listForCategory(categoryId);
    const keys = new Set<string>();

    try {
      for (const variant of variants) {
        const normalized = normalizeVariantAttributes(
          storedToInput(
            (variant.attributes ?? []).map((attribute) => ({
              attributeId: attribute.attributeId,
              text: attribute.text ?? '',
              number: attribute.number ?? null,
              optionIds: attribute.optionIds ?? [],
            })),
          ),
          assignments,
        );
        const optionKey = variantOptionKey(normalized);

        if (keys.has(optionKey)) {
          throw AppError.conflict('This category would make two variants identical');
        }

        keys.add(optionKey);
      }
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 422) {
        throw AppError.validation(
          'Update or delete the variants before using a category with different options',
        );
      }

      throw error;
    }
  },

  async detachImage(productId: Types.ObjectId, imageId: string) {
    await ProductVariantModel.updateMany({ productId, imageId }, { $set: { imageId: '' } });
  },

  async removeForProduct(productId: Types.ObjectId) {
    await ProductVariantModel.deleteMany({ productId });
  },

  async list(productId: string, query: ListVariantsQuery, viewer?: ProductViewer) {
    const product = await ProductModel.findById(productId);

    if (!product) {
      throw AppError.notFound('Product not found');
    }

    const access = await accessFor(product, viewer);
    const filter: {
      productId: Types.ObjectId;
      status?: VariantStatus;
    } = { productId: product._id };

    if (access === 'public') {
      filter.status = 'active';
    } else if (query.status) {
      filter.status = query.status;
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      ProductVariantModel.find(filter).sort(SORTS[query.sort]).skip(skip).limit(query.limit),
      ProductVariantModel.countDocuments(filter),
    ]);

    return {
      items: await mapVariants(
        items.map((item) => readVariant(item)),
        productImages(product),
      ),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async getById(productId: string, variantId: string, viewer?: ProductViewer) {
    const product = await ProductModel.findById(productId);

    if (!product) {
      throw AppError.notFound('Product not found');
    }

    const access = await accessFor(product, viewer);
    const variant = await ProductVariantModel.findOne({ _id: variantId, productId: product._id });

    if (!variant || (access === 'public' && variant.status !== 'active')) {
      throw AppError.notFound('Variant not found');
    }

    return present(variant, product);
  },

  async create(userId: string, productId: string, input: CreateVariantInput) {
    const product = await findOwnedProduct(userId, productId);
    assertVendorCanChange(product);

    const images = productImages(product);
    assertImage(input.imageId ?? '', images);

    const price = money(input.price);
    const compareAtPrice =
      input.compareAtPrice === undefined || input.compareAtPrice === null
        ? null
        : money(input.compareAtPrice);
    assertPrice(price, compareAtPrice);

    const { attributes, optionKey } = await resolveAttributes(
      String(product.categoryId),
      input.attributes,
    );
    const currentDefault = await ProductVariantModel.findOne({
      productId: product._id,
      isDefault: true,
    }).select('status');
    const nextStatus = input.status ?? 'active';
    const makeDefault =
      input.isDefault === true ||
      !currentDefault ||
      (currentDefault.status !== 'active' && nextStatus === 'active');
    const displaced = makeDefault ? await claimDefault(product._id) : null;

    const variant = new ProductVariantModel({
      productId: product._id,
      sku: input.sku,
      price,
      compareAtPrice,
      stock: input.stock ?? 0,
      imageId: input.imageId ?? '',
      attributes,
      optionKey,
      status: nextStatus,
      isDefault: makeDefault,
    });

    try {
      await variant.save();
    } catch (error) {
      await restoreDefault(displaced);
      throw mapDuplicate(error);
    }

    return present(variant, product);
  },

  async update(userId: string, productId: string, variantId: string, input: UpdateVariantInput) {
    const product = await findOwnedProduct(userId, productId);
    assertVendorCanChange(product);
    const variant = await ProductVariantModel.findOne({ _id: variantId, productId: product._id });

    if (!variant) {
      throw AppError.notFound('Variant not found');
    }

    const nextStatus = input.status ?? toStatus(variant.status);
    await assertKeepsActiveVariant(product, variant._id, nextStatus);

    if (input.isDefault === false && variant.isDefault) {
      throw AppError.validation('Choose another variant as the default first');
    }

    if (input.sku !== undefined) {
      variant.sku = input.sku;
    }

    const price = input.price !== undefined ? money(input.price) : variant.price;
    const compareAtPrice =
      input.compareAtPrice === undefined
        ? (variant.compareAtPrice ?? null)
        : input.compareAtPrice === null
          ? null
          : money(input.compareAtPrice);
    assertPrice(price, compareAtPrice);
    variant.price = price;
    variant.compareAtPrice = compareAtPrice;

    if (input.stock !== undefined) {
      variant.stock = input.stock;
    }

    if (input.imageId !== undefined) {
      const images = productImages(product);
      assertImage(input.imageId, images);
      variant.imageId = input.imageId;
    }

    if (input.attributes !== undefined) {
      const resolved = await resolveAttributes(String(product.categoryId), input.attributes);
      variant.set('attributes', resolved.attributes);
      variant.optionKey = resolved.optionKey;
    }

    variant.status = nextStatus;

    const promote =
      nextStatus === 'archived' && variant.isDefault
        ? await ProductVariantModel.findOne({
            productId: product._id,
            _id: { $ne: variant._id },
          }).sort({ status: 1, createdAt: 1 })
        : null;

    if (promote) {
      variant.isDefault = false;
    } else if (input.isDefault === true) {
      variant.isDefault = true;
    }

    const displaced =
      input.isDefault === true && !promote ? await claimDefault(product._id, variant._id) : null;

    try {
      await variant.save();

      if (promote) {
        promote.isDefault = true;
        await promote.save();
      }
    } catch (error) {
      if (promote) {
        await ProductVariantModel.updateOne({ _id: variant._id }, { $set: { isDefault: true } });
      }

      await restoreDefault(displaced);
      throw mapDuplicate(error);
    }

    return present(variant, product);
  },

  async remove(userId: string, productId: string, variantId: string) {
    const product = await findOwnedProduct(userId, productId);
    assertVendorCanChange(product);
    const variant = await ProductVariantModel.findOne({ _id: variantId, productId: product._id });

    if (!variant) {
      throw AppError.notFound('Variant not found');
    }

    await assertKeepsActiveVariant(product, variant._id, 'archived');

    const wasDefault = variant.isDefault;
    await variant.deleteOne();

    if (wasDefault) {
      await promoteDefault(product._id, variant._id);
    }

    return { id: String(variant._id) };
  },
};
