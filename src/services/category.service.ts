import type { FilterQuery, Types } from 'mongoose';
import { MAX_CATEGORY_LEVEL } from '../constants/category';
import { CategoryModel, type Category } from '../models/category.model';
import type {
  CategoryDetailDto,
  CategoryDto,
  CategoryLevel,
  CategoryTreeNode,
} from '../types/category';
import { AppError } from '../utils/AppError';
import { isDuplicateKeyError } from '../utils/mongoError';
import { escapeRegex, slugify } from '../utils/slugify';
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from '../validators/category.validator';

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
    items.map((item) => [item.id, { ...item, children: [] }]),
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

    return buildTree(items.map((item) => toDto(item)));
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

    if (input.image !== undefined) {
      category.image = input.image;
    }

    if (input.isActive !== undefined) {
      category.isActive = input.isActive;
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
      await CategoryModel.updateMany({ ancestors: category._id }, { $set: { isActive: false } });
    }

    return toDetail(category);
  },

  async remove(id: string) {
    const category = await findCategory(id);
    const hasChildren = await CategoryModel.exists({ parentId: category._id });

    if (hasChildren) {
      throw AppError.conflict('Delete child categories before deleting this category');
    }

    await category.deleteOne();

    return { id: String(category._id) };
  },
};
