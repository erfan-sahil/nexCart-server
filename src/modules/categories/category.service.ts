import type { FilterQuery, Types } from 'mongoose';
import { CATEGORY_LEVEL, MAX_CATEGORY_LEVEL, MAX_FEATURED_CATEGORIES } from './constants';
import { CategoryAttributeModel } from '../attributes/category-attribute.model';
import { CategoryModel, type Category } from './category.model';
import { ProductModel } from '../products/product.model';
import type {
  CategoryDetailDto,
  CategoryDto,
  CategoryLevel,
  CategoryTreeNode,
  FeaturedCategoryDto,
} from './types';
import { AppError } from '../../common/errors/AppError';
import { isDuplicateKeyError } from '../../common/errors/mongoError';
import { escapeRegex, slugify } from '../../common/utils/slugify';
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from './category.validator';
import { categoryImageStorageKey, imageStorage } from '../../infrastructure/storage/imageStorage';

type CategoryRecord = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  image: string;
  parentId?: Types.ObjectId | null;
  ancestors: Types.ObjectId[];
  level: number;
  isActive: boolean;
  sortOrder: number;
  isFeatured: boolean;
  featuredOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

const SORTS: Record<ListCategoriesQuery['sort'], Record<string, 1 | -1>> = {
  sortOrder: { sortOrder: 1, name: 1 },
  '-sortOrder': { sortOrder: -1, name: 1 },
  name: { name: 1 },
  '-name': { name: -1 },
  createdAt: { createdAt: 1 },
  '-createdAt': { createdAt: -1 },
};

const toLevel = (level: number): CategoryLevel => {
  if (level === 1 || level === 2 || level === 3) {
    return level;
  }

  throw AppError.internal('Stored category level is invalid');
};

const toDto = (record: CategoryRecord): CategoryDto => ({
  id: String(record._id),
  name: record.name,
  slug: record.slug,
  description: record.description,
  image: record.image,
  parentId: record.parentId ? String(record.parentId) : null,
  ancestors: record.ancestors.map((ancestorId) => String(ancestorId)),
  level: toLevel(record.level),
  isActive: record.isActive,
  sortOrder: record.sortOrder,
  isFeatured: record.isFeatured ?? false,
  featuredOrder: record.featuredOrder ?? 0,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

const toDetail = async (record: CategoryRecord): Promise<CategoryDetailDto> => {
  const ids = [...record.ancestors, record._id];
  const nodes = await CategoryModel.find({ _id: { $in: ids } })
    .select('name slug level')
    .lean();
  const byId = new Map(nodes.map((node) => [String(node._id), node]));

  const breadcrumb = ids.flatMap((id) => {
    const node = byId.get(String(id));

    if (!node) {
      return [];
    }

    return [
      {
        id: String(node._id),
        name: node.name,
        slug: node.slug,
        level: toLevel(node.level),
      },
    ];
  });

  return { ...toDto(record), breadcrumb };
};

const buildTree = (items: CategoryDto[]): CategoryTreeNode[] => {
  const nodes = new Map<string, CategoryTreeNode>(
    items.map((item) => [item.id, { ...item, children: [], productCount: 0 }]),
  );
  const roots: CategoryTreeNode[] = [];

  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;

    if (parent) {
      parent.children.push(node);
      continue;
    }

    if (node.level === 1) {
      roots.push(node);
    }
  }

  return roots;
};

const attachProductCounts = async (roots: CategoryTreeNode[]) => {
  const grouped = await ProductModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    {
      $match: {
        approvalStatus: 'approved',
        status: 'active',
        isPublished: true,
      },
    },
    { $group: { _id: '$categoryId', count: { $sum: 1 } } },
  ]);
  const counts = new Map(grouped.map((row) => [String(row._id), row.count]));

  const fill = (node: CategoryTreeNode): number => {
    const total =
      (counts.get(node.id) ?? 0) + node.children.reduce((sum, child) => sum + fill(child), 0);

    node.productCount = total;
    return total;
  };

  roots.forEach((root) => {
    fill(root);
  });

  return roots;
};

const countFeaturedRoots = () =>
  CategoryModel.countDocuments({ level: CATEGORY_LEVEL.ROOT, isFeatured: true });

const assertCanFeature = async (category: Category) => {
  if (category.level !== CATEGORY_LEVEL.ROOT) {
    throw AppError.validation('Only a root category can be featured');
  }

  if (!category.isActive) {
    throw AppError.validation('Only an active category can be featured');
  }

  if (category.isFeatured) {
    return;
  }

  const featuredCount = await countFeaturedRoots();

  if (featuredCount >= MAX_FEATURED_CATEGORIES) {
    throw AppError.validation(`At most ${MAX_FEATURED_CATEGORIES} categories can be featured`);
  }
};

const slugTaken = async (slug: string, excludeId?: string) => {
  const filter: FilterQuery<Category> = { slug };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  return CategoryModel.exists(filter);
};

const resolveSlug = async (requested: string | undefined, name: string, excludeId?: string) => {
  const base = slugify(requested ?? name);

  if (base.length < 2) {
    throw AppError.validation('Could not generate a valid slug from the category name');
  }

  if (requested) {
    if (await slugTaken(base, excludeId)) {
      throw AppError.conflict('A category with this slug already exists');
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

  throw AppError.conflict('A category with this slug already exists');
};

const resolveParent = async (
  parentId: string | null | undefined,
  requestedLevel?: CategoryLevel,
) => {
  if (!parentId) {
    if (requestedLevel && requestedLevel !== 1) {
      throw AppError.validation('A root category must be level 1');
    }

    return {
      parentId: null,
      ancestors: [] as Types.ObjectId[],
      level: 1 as CategoryLevel,
    };
  }

  const parent = await CategoryModel.findById(parentId).select('_id level ancestors').lean();

  if (!parent) {
    throw AppError.badRequest('Parent category was not found');
  }

  if (parent.level >= MAX_CATEGORY_LEVEL) {
    throw AppError.badRequest('A sub-subcategory cannot have child categories');
  }

  const level = toLevel(parent.level + 1);

  if (requestedLevel && requestedLevel !== level) {
    throw AppError.validation(`This category must be level ${level} for the selected parent`);
  }

  return {
    parentId: parent._id,
    ancestors: [...parent.ancestors, parent._id],
    level,
  };
};

const releaseCategoryImage = async (imageUrl: string) => {
  const storageKey = categoryImageStorageKey(imageUrl);

  if (!storageKey) {
    return;
  }

  await imageStorage.removeCategory(storageKey).catch(() => undefined);
};

const findCategory = async (id: string) => {
  const category = await CategoryModel.findById(id);

  if (!category) {
    throw AppError.notFound('Category not found');
  }

  return category;
};

export const categoryService = {
  async create(input: CreateCategoryInput) {
    const parent = await resolveParent(input.parentId, input.level);
    const slug = await resolveSlug(input.slug, input.name);

    try {
      const created = await CategoryModel.create({
        name: input.name,
        slug,
        description: input.description ?? '',
        image: input.image ?? '',
        parentId: parent.parentId,
        ancestors: parent.ancestors,
        level: parent.level,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      });

      return toDetail(created);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw AppError.conflict('A category with this slug already exists');
      }

      throw error;
    }
  },

  async list(query: ListCategoriesQuery) {
    const filter: FilterQuery<Category> = {};

    if (query.level) {
      filter.level = query.level;
    }

    if (query.parentId) {
      filter.parentId = query.parentId;
    }

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    if (query.search) {
      filter.name = { $regex: escapeRegex(query.search), $options: 'i' };
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      CategoryModel.find(filter).sort(SORTS[query.sort]).skip(skip).limit(query.limit).lean(),
      CategoryModel.countDocuments(filter),
    ]);

    return {
      items: items.map((item) => toDto(item)),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async tree(isActive?: boolean) {
    const filter: FilterQuery<Category> = {};

    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    const items = await CategoryModel.find(filter).sort({ sortOrder: 1, name: 1 }).lean();

    return attachProductCounts(buildTree(items.map((item) => toDto(item))));
  },

  async getById(id: string) {
    const category = await findCategory(id);
    return toDetail(category);
  },

  async getBySlug(slug: string) {
    const category = await CategoryModel.findOne({ slug });

    if (!category) {
      throw AppError.notFound('Category not found');
    }

    return toDetail(category);
  },

  async update(id: string, input: UpdateCategoryInput) {
    const category = await findCategory(id);
    const nextParentId = input.parentId === undefined ? undefined : input.parentId;
    const currentParentId = category.parentId ? String(category.parentId) : null;
    const parentChanging = nextParentId !== undefined && nextParentId !== currentParentId;

    if (parentChanging) {
      if (nextParentId === id) {
        throw AppError.badRequest('A category cannot be its own parent');
      }

      const hasChildren = await CategoryModel.exists({ parentId: category._id });

      if (hasChildren) {
        throw AppError.conflict('Move or delete child categories before changing the parent');
      }

      const parent = await resolveParent(nextParentId);
      category.parentId = parent.parentId;
      category.ancestors = parent.ancestors;
      category.level = parent.level;
    }

    if (input.name !== undefined) {
      category.name = input.name;
    }

    if (input.slug !== undefined) {
      category.slug = await resolveSlug(input.slug, category.name, id);
    }

    if (input.description !== undefined) {
      category.description = input.description;
    }

    const previousImage = category.image;

    if (input.image !== undefined) {
      category.image = input.image;
    }

    if (input.isActive !== undefined) {
      category.isActive = input.isActive;

      if (input.isActive === false) {
        category.isFeatured = false;
        category.featuredOrder = 0;
      }
    }

    if (input.sortOrder !== undefined) {
      category.sortOrder = input.sortOrder;
    }

    try {
      await category.save();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw AppError.conflict('A category with this slug already exists');
      }

      throw error;
    }

    if (input.isActive === false) {
      await CategoryModel.updateMany(
        { ancestors: category._id },
        { $set: { isActive: false, isFeatured: false, featuredOrder: 0 } },
      );
    }

    if (input.image !== undefined && previousImage !== category.image) {
      await releaseCategoryImage(previousImage);
    }

    return toDetail(category);
  },

  async remove(id: string) {
    const category = await findCategory(id);
    const hasChildren = await CategoryModel.exists({ parentId: category._id });

    if (hasChildren) {
      throw AppError.conflict('Delete child categories before deleting this category');
    }

    const image = category.image;

    await category.deleteOne();
    await CategoryAttributeModel.deleteMany({ categoryId: category._id });
    await releaseCategoryImage(image);

    return { id: String(category._id) };
  },

  async listFeatured(): Promise<FeaturedCategoryDto[]> {
    const [tree, featured] = await Promise.all([
      this.tree(true),
      CategoryModel.find({
        level: CATEGORY_LEVEL.ROOT,
        isActive: true,
        isFeatured: true,
      })
        .sort({ featuredOrder: 1, name: 1 })
        .lean(),
    ]);

    const counts = new Map<string, number>();
    const collectCounts = (node: CategoryTreeNode) => {
      counts.set(node.id, node.productCount);
      node.children.forEach(collectCounts);
    };
    tree.forEach(collectCounts);

    return featured.map((item) => ({
      ...toDto(item),
      productCount: counts.get(String(item._id)) ?? 0,
    }));
  },

  async setFeatured(id: string, isFeatured: boolean) {
    const category = await findCategory(id);

    if (isFeatured) {
      await assertCanFeature(category);
      const order = await countFeaturedRoots();
      category.isFeatured = true;
      category.featuredOrder = order;
    } else {
      category.isFeatured = false;
      category.featuredOrder = 0;
    }

    await category.save();
    return toDetail(category);
  },

  async updateFeaturedOrder(categoryIds: string[]) {
    if (categoryIds.length > MAX_FEATURED_CATEGORIES) {
      throw AppError.validation(`At most ${MAX_FEATURED_CATEGORIES} categories can be featured`);
    }

    const unique = new Set(categoryIds);

    if (unique.size !== categoryIds.length) {
      throw AppError.validation('Each category can only appear once');
    }

    const categories = await CategoryModel.find({
      _id: { $in: categoryIds },
      level: CATEGORY_LEVEL.ROOT,
      isActive: true,
      isFeatured: true,
    }).select('_id');

    if (categories.length !== categoryIds.length) {
      throw AppError.validation('Featured order must include only active featured root categories');
    }

    await Promise.all(
      categoryIds.map((categoryId, index) =>
        CategoryModel.updateOne({ _id: categoryId }, { $set: { featuredOrder: index } }),
      ),
    );

    return this.listFeatured();
  },
};
