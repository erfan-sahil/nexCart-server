import { Types, type FilterQuery, type PipelineStage } from 'mongoose';
import { PRODUCT_APPROVAL_STATUSES, PRODUCT_STATUSES } from '../constants/product';
import { VARIANT_STATUSES } from '../constants/variant';
import { AttributeModel } from '../models/attribute.model';
import { CategoryAttributeModel } from '../models/categoryAttribute.model';
import { CategoryModel } from '../models/category.model';
import { ProductModel, type Product } from '../models/product.model';
import { ProductVariantModel } from '../models/productVariant.model';
import { StoreModel } from '../models/store.model';
import type { UserRole } from '../types/auth';
import type {
  InventoryOption,
  InventoryProduct,
  InventoryProductDetail,
  InventorySummary,
  InventoryVariant,
  StockLevel,
} from '../types/inventory';
import type { ProductApprovalStatus, ProductStatus } from '../types/product';
import type { VariantStatus } from '../types/variant';
import { AppError } from '../utils/AppError';
import { escapeRegex } from '../utils/slugify';
import type {
  InventoryProductVariantsQuery,
  InventorySummaryQuery,
  ListInventoryProductsQuery,
  ListInventoryVariantsQuery,
} from '../validators/inventory.validator';

type InventoryActor = {
  id: string;
  role: UserRole;
};

type InventoryScope = {
  storeId?: Types.ObjectId;
};

type CatalogFilter = {
  storeId?: string;
  categoryId?: string;
  status?: ProductStatus;
  approvalStatus?: ProductApprovalStatus;
};

type ProductSort = ListInventoryProductsQuery['sort'];
type VariantSort = ListInventoryVariantsQuery['sort'];

type ThumbnailRow = {
  id: string;
  url: string;
  alt: string;
};

type RefRow = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
};

type ProductInventoryRow = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  status: string;
  approvalStatus: string;
  isPublished: boolean;
  thumbnail: ThumbnailRow | null;
  storeId: Types.ObjectId;
  categoryId: Types.ObjectId;
  store: RefRow | null;
  category: RefRow | null;
  defaultSku: string;
  minPrice: number | null;
  maxPrice: number | null;
  variantCount: number;
  activeVariantCount: number;
  totalStock: number;
  sellableStock: number;
  lowStockVariantCount: number;
  outOfStockVariantCount: number;
  stockLevel: StockLevel;
  updatedAt: Date;
};

type VariantAttributeRow = {
  attributeId: Types.ObjectId;
  text?: string;
  number?: number | null;
  optionIds?: Types.ObjectId[];
};

type VariantInventoryRow = {
  _id: Types.ObjectId;
  sku: string;
  price: number;
  discountType: 'percent' | 'amount' | null;
  discountValue: number | null;
  stock: number;
  status: string;
  isDefault: boolean;
  attributes: VariantAttributeRow[];
  createdAt: Date;
  updatedAt: Date;
  product: {
    _id: Types.ObjectId;
    name: string;
    slug: string;
    status: string;
    storeId: Types.ObjectId;
    store: RefRow | null;
  };
};

const PRODUCT_SORTS: Record<ProductSort, Record<string, 1 | -1>> = {
  name: { name: 1, _id: 1 },
  '-name': { name: -1, _id: 1 },
  totalStock: { totalStock: 1, _id: 1 },
  '-totalStock': { totalStock: -1, _id: 1 },
  sellableStock: { sellableStock: 1, _id: 1 },
  '-sellableStock': { sellableStock: -1, _id: 1 },
  updatedAt: { updatedAt: 1, _id: 1 },
  '-updatedAt': { updatedAt: -1, _id: 1 },
};

const VARIANT_SORTS: Record<VariantSort, Record<string, 1 | -1>> = {
  sku: { sku: 1, _id: 1 },
  '-sku': { sku: -1, _id: 1 },
  stock: { stock: 1, _id: 1 },
  '-stock': { stock: -1, _id: 1 },
  price: { price: 1, _id: 1 },
  '-price': { price: -1, _id: 1 },
  updatedAt: { updatedAt: 1, _id: 1 },
  '-updatedAt': { updatedAt: -1, _id: 1 },
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const currentPriceFor = (
  price: number,
  discountType: 'percent' | 'amount' | null,
  discountValue: number | null,
) => {
  if (!discountType || discountValue === null) {
    return price;
  }

  if (discountType === 'percent') {
    return money(price * (1 - discountValue / 100));
  }

  return money(price - discountValue);
};

const stockLevelFor = (stock: number, lowStockAt: number): StockLevel => {
  if (stock <= 0) {
    return 'out_of_stock';
  }

  if (stock <= lowStockAt) {
    return 'low_stock';
  }

  return 'in_stock';
};

const stockLevelExpression = (stockPath: string, lowStockAt: number) => ({
  $switch: {
    branches: [
      { case: { $lte: [stockPath, 0] }, then: 'out_of_stock' },
      { case: { $lte: [stockPath, lowStockAt] }, then: 'low_stock' },
    ],
    default: 'in_stock',
  },
});

const variantStockMatch = (stockLevel: StockLevel | undefined, lowStockAt: number) => {
  if (stockLevel === 'out_of_stock') {
    return { stock: 0 };
  }

  if (stockLevel === 'low_stock') {
    return { stock: { $gt: 0, $lte: lowStockAt } };
  }

  if (stockLevel === 'in_stock') {
    return { stock: { $gt: lowStockAt } };
  }

  return {};
};

const toProductStatus = (status: string): ProductStatus => {
  if ((PRODUCT_STATUSES as readonly string[]).includes(status)) {
    return status as ProductStatus;
  }

  throw AppError.internal('Stored product status is invalid');
};

const toApprovalStatus = (status: string): ProductApprovalStatus => {
  if ((PRODUCT_APPROVAL_STATUSES as readonly string[]).includes(status)) {
    return status as ProductApprovalStatus;
  }

  throw AppError.internal('Stored product approval status is invalid');
};

const toVariantStatus = (status: string): VariantStatus => {
  if ((VARIANT_STATUSES as readonly string[]).includes(status)) {
    return status as VariantStatus;
  }

  throw AppError.internal('Stored variant status is invalid');
};

const toStockLevel = (level: string): StockLevel => {
  if (level === 'in_stock' || level === 'low_stock' || level === 'out_of_stock') {
    return level;
  }

  throw AppError.internal('Stored stock level is invalid');
};

const emptySummary = (lowStockAt: number): InventorySummary => ({
  lowStockAt,
  productCount: 0,
  variantCount: 0,
  totalUnits: 0,
  sellableUnits: 0,
  products: { inStock: 0, lowStock: 0, outOfStock: 0 },
  variants: { inStock: 0, lowStock: 0, outOfStock: 0 },
});

const refOf = (row: RefRow | null, fallbackId: Types.ObjectId) => ({
  id: String(row?._id ?? fallbackId),
  name: row?.name ?? '',
  slug: row?.slug ?? '',
});

const resolveScope = async (actor: InventoryActor, storeId?: string): Promise<InventoryScope> => {
  if (actor.role === 'vendor') {
    const store = await StoreModel.findOne({ userId: actor.id }).select('_id');

    if (!store) {
      throw AppError.notFound('Store not found');
    }

    if (storeId && storeId !== String(store._id)) {
      throw AppError.forbidden('You can only view inventory for your store');
    }

    return { storeId: store._id };
  }

  if (actor.role === 'admin') {
    if (!storeId) {
      return {};
    }

    const store = await StoreModel.exists({ _id: storeId });

    if (!store) {
      throw AppError.notFound('Store not found');
    }

    return { storeId: new Types.ObjectId(storeId) };
  }

  throw AppError.forbidden('You do not have permission to view inventory');
};

const categoryIdsFor = async (categoryId?: string) => {
  if (!categoryId) {
    return undefined;
  }

  const category = await CategoryModel.findById(categoryId).select('_id');

  if (!category) {
    throw AppError.notFound('Category not found');
  }

  const children = await CategoryModel.find({ ancestors: category._id }).select('_id');

  return [category._id, ...children.map((child) => child._id)];
};

const catalogMatch = async (scope: InventoryScope, filter: CatalogFilter) => {
  const match: FilterQuery<Product> = {};

  if (scope.storeId) {
    match.storeId = scope.storeId;
  }

  if (filter.status) {
    match.status = filter.status;
  }

  if (filter.approvalStatus) {
    match.approvalStatus = filter.approvalStatus;
  }

  const categoryIds = await categoryIdsFor(filter.categoryId);

  if (categoryIds) {
    match.categoryId = { $in: categoryIds };
  }

  return match;
};

const searchProductIds = async (match: FilterQuery<Product>, search: string) => {
  const pattern = { $regex: escapeRegex(search), $options: 'i' };
  const skuProductIds = await ProductVariantModel.find({ sku: pattern }).distinct('productId');

  return ProductModel.find({
    ...match,
    $or: [{ name: pattern }, { slug: pattern }, { _id: { $in: skuProductIds } }],
  }).distinct('_id');
};

const productMetrics = (lowStockAt: number): PipelineStage => ({
  $addFields: {
    totalStock: { $sum: '$variants.stock' },
    variantCount: { $size: '$variants' },
    activeVariants: {
      $filter: {
        input: '$variants',
        as: 'variant',
        cond: { $eq: ['$$variant.status', 'active'] },
      },
    },
    lowStockVariantCount: {
      $size: {
        $filter: {
          input: '$variants',
          as: 'variant',
          cond: {
            $and: [{ $gt: ['$$variant.stock', 0] }, { $lte: ['$$variant.stock', lowStockAt] }],
          },
        },
      },
    },
    outOfStockVariantCount: {
      $size: {
        $filter: {
          input: '$variants',
          as: 'variant',
          cond: { $lte: ['$$variant.stock', 0] },
        },
      },
    },
    thumbnail: {
      $let: {
        vars: {
          matched: {
            $first: {
              $filter: {
                input: '$images',
                as: 'image',
                cond: { $eq: ['$$image.imageId', '$thumbnailId'] },
              },
            },
          },
        },
        in: {
          $let: {
            vars: {
              image: { $ifNull: ['$$matched', { $arrayElemAt: ['$images', 0] }] },
            },
            in: {
              $cond: [
                { $ifNull: ['$$image', false] },
                {
                  id: '$$image.imageId',
                  url: '$$image.url',
                  alt: { $ifNull: ['$$image.alt', ''] },
                },
                null,
              ],
            },
          },
        },
      },
    },
  },
});

const productStockFields = (lowStockAt: number): PipelineStage => ({
  $addFields: {
    activeVariantCount: { $size: '$activeVariants' },
    sellableStock: { $sum: '$activeVariants.stock' },
    minPrice: { $min: '$activeVariants.price' },
    maxPrice: { $max: '$activeVariants.price' },
    defaultSku: {
      $let: {
        vars: {
          variant: {
            $first: {
              $filter: {
                input: '$variants',
                as: 'variant',
                cond: { $eq: ['$$variant.isDefault', true] },
              },
            },
          },
        },
        in: { $ifNull: ['$$variant.sku', ''] },
      },
    },
    stockLevel: stockLevelExpression('$totalStock', lowStockAt),
  },
});

const lookupVariants = (): PipelineStage => ({
  $lookup: {
    from: ProductVariantModel.collection.collectionName,
    localField: '_id',
    foreignField: 'productId',
    as: 'variants',
    pipeline: [
      {
        $project: {
          sku: 1,
          price: 1,
          stock: 1,
          status: 1,
          isDefault: 1,
        },
      },
    ],
  },
});

const attachCatalogRefs = (): PipelineStage.FacetPipelineStage[] => [
  {
    $lookup: {
      from: StoreModel.collection.collectionName,
      localField: 'storeId',
      foreignField: '_id',
      as: 'store',
      pipeline: [{ $project: { name: 1, slug: 1 } }],
    },
  },
  { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
  {
    $lookup: {
      from: CategoryModel.collection.collectionName,
      localField: 'categoryId',
      foreignField: '_id',
      as: 'category',
      pipeline: [{ $project: { name: 1, slug: 1 } }],
    },
  },
  { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
];

const toProduct = (row: ProductInventoryRow, lowStockAt: number): InventoryProduct => ({
  id: String(row._id),
  name: row.name,
  slug: row.slug,
  status: toProductStatus(row.status),
  approvalStatus: toApprovalStatus(row.approvalStatus),
  isPublished: row.isPublished,
  thumbnail: row.thumbnail,
  store: refOf(row.store, row.storeId),
  category: refOf(row.category, row.categoryId),
  defaultSku: row.defaultSku || null,
  minPrice: row.minPrice,
  maxPrice: row.maxPrice,
  variantCount: row.variantCount,
  activeVariantCount: row.activeVariantCount,
  totalStock: row.totalStock,
  sellableStock: row.sellableStock,
  lowStockVariantCount: row.lowStockVariantCount,
  outOfStockVariantCount: row.outOfStockVariantCount,
  stockLevel: toStockLevel(row.stockLevel),
  lowStockAt,
  updatedAt: row.updatedAt.toISOString(),
});

const queryProducts = async (
  match: FilterQuery<Product>,
  query: {
    sort: ProductSort;
    page: number;
    limit: number;
    stockLevel?: StockLevel;
    lowStockAt: number;
  },
) => {
  const skip = (query.page - 1) * query.limit;
  const pipeline: PipelineStage[] = [
    { $match: match },
    lookupVariants(),
    productMetrics(query.lowStockAt),
    productStockFields(query.lowStockAt),
  ];

  if (query.stockLevel) {
    pipeline.push({ $match: { stockLevel: query.stockLevel } });
  }

  pipeline.push(
    {
      $project: {
        name: 1,
        slug: 1,
        status: 1,
        approvalStatus: 1,
        isPublished: 1,
        thumbnail: 1,
        storeId: 1,
        categoryId: 1,
        defaultSku: 1,
        minPrice: 1,
        maxPrice: 1,
        variantCount: 1,
        activeVariantCount: 1,
        totalStock: 1,
        sellableStock: 1,
        lowStockVariantCount: 1,
        outOfStockVariantCount: 1,
        stockLevel: 1,
        updatedAt: 1,
      },
    },
    {
      $facet: {
        items: [
          { $sort: PRODUCT_SORTS[query.sort] },
          { $skip: skip },
          { $limit: query.limit },
          ...attachCatalogRefs(),
        ],
        total: [{ $count: 'count' }],
      },
    },
  );

  const [result] = await ProductModel.aggregate<{
    items: ProductInventoryRow[];
    total: { count: number }[];
  }>(pipeline).option({ allowDiskUse: true });

  return {
    items: (result?.items ?? []).map((item) => toProduct(item, query.lowStockAt)),
    total: result?.total[0]?.count ?? 0,
    page: query.page,
    limit: query.limit,
  };
};

const optionLabels = async (rows: VariantInventoryRow[]) => {
  const attributeIds = [
    ...new Set(
      rows.flatMap((row) => row.attributes.map((attribute) => String(attribute.attributeId))),
    ),
  ];
  const optionIds = rows.flatMap((row) =>
    row.attributes.flatMap((attribute) => attribute.optionIds ?? []),
  );
  const [attributes, optionRows] = await Promise.all([
    attributeIds.length > 0
      ? AttributeModel.find({ _id: { $in: attributeIds } })
          .select('name type unit')
          .lean()
      : Promise.resolve([]),
    optionIds.length > 0
      ? CategoryAttributeModel.find({ 'options._id': { $in: optionIds } })
          .select('options')
          .lean()
      : Promise.resolve([]),
  ]);
  const attributesById = new Map(attributes.map((attribute) => [String(attribute._id), attribute]));
  const optionsById = new Map<string, string>();

  for (const row of optionRows) {
    for (const option of row.options ?? []) {
      optionsById.set(String(option._id), option.label);
    }
  }

  const labels = new Map<string, InventoryOption[]>();

  for (const row of rows) {
    labels.set(
      String(row._id),
      row.attributes.flatMap((attribute) => {
        const meta = attributesById.get(String(attribute.attributeId));
        const name = meta?.name ?? 'Option';

        if (
          meta?.type === 'number' &&
          attribute.number !== null &&
          attribute.number !== undefined
        ) {
          const unit = meta.unit ? ` ${meta.unit}` : '';

          return [{ name, value: `${attribute.number}${unit}` }];
        }

        if (attribute.text) {
          return [{ name, value: attribute.text }];
        }

        return (attribute.optionIds ?? []).flatMap((optionId) => {
          const value = optionsById.get(String(optionId));

          return value ? [{ name, value }] : [];
        });
      }),
    );
  }

  return labels;
};

const toVariants = async (rows: VariantInventoryRow[], lowStockAt: number) => {
  const labels = await optionLabels(rows);

  return rows.map((row): InventoryVariant => {
    const discountType =
      row.discountType === 'percent' || row.discountType === 'amount' ? row.discountType : null;

    return {
      id: String(row._id),
      sku: row.sku,
      price: row.price,
      currentPrice: currentPriceFor(row.price, discountType, row.discountValue),
      stock: row.stock,
      stockLevel: stockLevelFor(row.stock, lowStockAt),
      lowStockAt,
      status: toVariantStatus(row.status),
      isDefault: row.isDefault,
      options: labels.get(String(row._id)) ?? [],
      product: {
        id: String(row.product._id),
        name: row.product.name,
        slug: row.product.slug,
        status: toProductStatus(row.product.status),
      },
      store: refOf(row.product.store, row.product.storeId),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
};

const queryVariants = async (
  scope: InventoryScope,
  query: {
    page: number;
    limit: number;
    search?: string;
    stockLevel?: StockLevel;
    lowStockAt: number;
    sort: VariantSort;
    productId?: string;
    status?: VariantStatus;
  },
) => {
  if (query.productId) {
    const owned = await ProductModel.exists({
      _id: query.productId,
      ...(scope.storeId ? { storeId: scope.storeId } : {}),
    });

    if (!owned) {
      throw AppError.notFound('Product not found');
    }
  }

  const match: FilterQuery<unknown> = {
    ...variantStockMatch(query.stockLevel, query.lowStockAt),
  };

  if (query.productId) {
    match.productId = new Types.ObjectId(query.productId);
  }

  if (query.status) {
    match.status = query.status;
  }

  if (query.search) {
    const pattern = { $regex: escapeRegex(query.search), $options: 'i' };
    const productMatch: FilterQuery<Product> = scope.storeId ? { storeId: scope.storeId } : {};
    const [variantIds, productIds] = await Promise.all([
      ProductVariantModel.find({ sku: pattern }).distinct('_id'),
      ProductModel.find({
        ...productMatch,
        $or: [{ name: pattern }, { slug: pattern }],
      }).distinct('_id'),
    ]);

    if (variantIds.length === 0 && productIds.length === 0) {
      return { items: [], total: 0, page: query.page, limit: query.limit };
    }

    match.$or = [{ _id: { $in: variantIds } }, { productId: { $in: productIds } }];
  }

  const productScope: FilterQuery<Product> = {};

  if (scope.storeId) {
    productScope.storeId = scope.storeId;
  }

  const skip = (query.page - 1) * query.limit;
  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $lookup: {
        from: ProductModel.collection.collectionName,
        localField: 'productId',
        foreignField: '_id',
        as: 'product',
        pipeline: [
          { $match: productScope },
          { $project: { name: 1, slug: 1, status: 1, storeId: 1 } },
          {
            $lookup: {
              from: StoreModel.collection.collectionName,
              localField: 'storeId',
              foreignField: '_id',
              as: 'store',
              pipeline: [{ $project: { name: 1, slug: 1 } }],
            },
          },
          { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
        ],
      },
    },
    { $unwind: '$product' },
    {
      $facet: {
        items: [
          { $sort: VARIANT_SORTS[query.sort] },
          { $skip: skip },
          { $limit: query.limit },
          {
            $project: {
              sku: 1,
              price: 1,
              discountType: 1,
              discountValue: 1,
              stock: 1,
              status: 1,
              isDefault: 1,
              attributes: 1,
              createdAt: 1,
              updatedAt: 1,
              product: 1,
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ];

  const [result] = await ProductVariantModel.aggregate<{
    items: VariantInventoryRow[];
    total: { count: number }[];
  }>(pipeline).option({ allowDiskUse: true });
  const items = await toVariants(result?.items ?? [], query.lowStockAt);

  return {
    items,
    total: result?.total[0]?.count ?? 0,
    page: query.page,
    limit: query.limit,
  };
};

export const inventoryService = {
  async summary(actor: InventoryActor, query: InventorySummaryQuery) {
    const scope = await resolveScope(actor, query.storeId);
    const match = await catalogMatch(scope, query);
    const [row] = await ProductModel.aggregate<{
      productCount: number;
      variantCount: number;
      totalUnits: number;
      sellableUnits: number;
      inStockProducts: number;
      lowStockProducts: number;
      outOfStockProducts: number;
      inStockVariants: number;
      lowStockVariants: number;
      outOfStockVariants: number;
    }>([
      { $match: match },
      lookupVariants(),
      productMetrics(query.lowStockAt),
      productStockFields(query.lowStockAt),
      {
        $group: {
          _id: null,
          productCount: { $sum: 1 },
          variantCount: { $sum: '$variantCount' },
          totalUnits: { $sum: '$totalStock' },
          sellableUnits: { $sum: '$sellableStock' },
          inStockProducts: {
            $sum: { $cond: [{ $eq: ['$stockLevel', 'in_stock'] }, 1, 0] },
          },
          lowStockProducts: {
            $sum: { $cond: [{ $eq: ['$stockLevel', 'low_stock'] }, 1, 0] },
          },
          outOfStockProducts: {
            $sum: { $cond: [{ $eq: ['$stockLevel', 'out_of_stock'] }, 1, 0] },
          },
          lowStockVariants: { $sum: '$lowStockVariantCount' },
          outOfStockVariants: { $sum: '$outOfStockVariantCount' },
          inStockVariants: {
            $sum: {
              $subtract: [
                '$variantCount',
                { $add: ['$lowStockVariantCount', '$outOfStockVariantCount'] },
              ],
            },
          },
        },
      },
    ]).option({ allowDiskUse: true });

    if (!row) {
      return emptySummary(query.lowStockAt);
    }

    return {
      lowStockAt: query.lowStockAt,
      productCount: row.productCount,
      variantCount: row.variantCount,
      totalUnits: row.totalUnits,
      sellableUnits: row.sellableUnits,
      products: {
        inStock: row.inStockProducts,
        lowStock: row.lowStockProducts,
        outOfStock: row.outOfStockProducts,
      },
      variants: {
        inStock: row.inStockVariants,
        lowStock: row.lowStockVariants,
        outOfStock: row.outOfStockVariants,
      },
    } satisfies InventorySummary;
  },

  async listProducts(actor: InventoryActor, query: ListInventoryProductsQuery) {
    const scope = await resolveScope(actor, query.storeId);
    const match = await catalogMatch(scope, query);

    if (query.search) {
      const ids = await searchProductIds(match, query.search);

      if (ids.length === 0) {
        return { items: [], total: 0, page: query.page, limit: query.limit };
      }

      match._id = { $in: ids };
    }

    return queryProducts(match, query);
  },

  async getProduct(
    actor: InventoryActor,
    productId: string,
    query: InventoryProductVariantsQuery,
  ): Promise<{ detail: InventoryProductDetail; total: number; page: number; limit: number }> {
    const scope = await resolveScope(actor);
    const match = await catalogMatch(scope, {});
    match._id = new Types.ObjectId(productId);
    const products = await queryProducts(match, {
      sort: '-updatedAt',
      page: 1,
      limit: 1,
      lowStockAt: query.lowStockAt,
    });
    const product = products.items[0];

    if (!product) {
      throw AppError.notFound('Product not found');
    }

    const variants = await queryVariants(scope, {
      ...query,
      productId,
    });

    return {
      detail: {
        product,
        variants: variants.items,
      },
      total: variants.total,
      page: variants.page,
      limit: variants.limit,
    };
  },

  async listVariants(actor: InventoryActor, query: ListInventoryVariantsQuery) {
    const scope = await resolveScope(actor, query.storeId);

    return queryVariants(scope, query);
  },
};
