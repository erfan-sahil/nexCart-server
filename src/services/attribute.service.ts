import type { FilterQuery, Types } from 'mongoose';
import {
  isChoiceAttributeType,
  isVariantAttributeType,
  type ATTRIBUTE_ROLES,
  type ATTRIBUTE_TYPES,
} from '../constants/attribute';
import { AttributeModel, type Attribute } from '../models/attribute.model';
import { CategoryModel } from '../models/category.model';
import { CategoryAttributeModel } from '../models/categoryAttribute.model';
import type {
  AttributeDto,
  AttributeOptionDto,
  AttributeRole,
  AttributeType,
  AttributeValueMode,
  CategoryAttributeDto,
} from '../types/attribute';
import { AppError } from '../utils/AppError';
import { isDuplicateKeyError } from '../utils/mongoError';
import { escapeRegex, slugify } from '../utils/slugify';
import type {
  CreateAttributeInput,
  ListAttributesQuery,
  ReplaceCategoryAttributesInput,
  UpdateAttributeInput,
} from '../validators/attribute.validator';

type OptionInput = NonNullable<
  ReplaceCategoryAttributesInput['attributes'][number]['options']
>[number];

type OptionRecord = {
  _id: Types.ObjectId;
  label: string;
  value: string;
  sortOrder: number;
  isActive: boolean;
};

type AttributeRecord = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  type: string;
  role: string;
  unit: string;
  isFilterable: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AssignmentRecord = {
  _id: Types.ObjectId;
  categoryId: Types.ObjectId;
  attributeId: Types.ObjectId;
  isRequired: boolean;
  isFilterable: boolean;
  sortOrder: number;
  options: OptionRecord[];
};

const SORTS: Record<ListAttributesQuery['sort'], Record<string, 1 | -1>> = {
  name: { name: 1 },
  '-name': { name: -1 },
  createdAt: { createdAt: 1 },
  '-createdAt': { createdAt: -1 },
};

const toType = (type: string): AttributeType => {
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

const toRole = (role: string): AttributeRole => {
  if (role === 'spec' || role === 'variant') {
    return role;
  }

  throw AppError.internal('Stored attribute role is invalid');
};

const valueModeFor = (type: AttributeType): AttributeValueMode =>
  isChoiceAttributeType(type) ? 'choice' : 'open';

const toOptionDto = (option: OptionRecord): AttributeOptionDto => ({
  id: String(option._id),
  label: option.label,
  value: option.value,
  sortOrder: option.sortOrder,
  isActive: option.isActive,
});

const toDto = (record: AttributeRecord): AttributeDto => {
  const type = toType(record.type);

  return {
    id: String(record._id),
    name: record.name,
    slug: record.slug,
    description: record.description,
    type,
    role: toRole(record.role),
    valueMode: valueModeFor(type),
    unit: record.unit,
    isFilterable: record.isFilterable,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
};

const slugTaken = async (slug: string, excludeId?: string) => {
  const filter: FilterQuery<Attribute> = { slug };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  return AttributeModel.exists(filter);
};

const resolveSlug = async (requested: string | undefined, name: string, excludeId?: string) => {
  const base = slugify(requested ?? name);

  if (base.length < 2) {
    throw AppError.validation('Could not generate a valid slug from the attribute name');
  }

  if (requested) {
    if (await slugTaken(base, excludeId)) {
      throw AppError.conflict('An attribute with this slug already exists');
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

  throw AppError.conflict('An attribute with this slug already exists');
};

const prepareOptions = (options: OptionInput[], existing: OptionRecord[] = []) => {
  const seen = new Set<string>();

  return options.map((option) => {
    const value = slugify(option.value ?? option.label);

    if (value.length < 1) {
      throw AppError.validation(`Option "${option.label}" needs a usable value`);
    }

    if (seen.has(value)) {
      throw AppError.validation('Option values must be unique');
    }

    seen.add(value);

    const previous =
      existing.find((item) => option.id && String(item._id) === option.id) ??
      existing.find((item) => item.value === value);

    return {
      ...(previous ? { _id: previous._id } : {}),
      label: option.label,
      value,
      sortOrder: option.sortOrder ?? previous?.sortOrder ?? 0,
      isActive: option.isActive ?? previous?.isActive ?? true,
    };
  });
};

const assertRules = (
  type: (typeof ATTRIBUTE_TYPES)[number],
  role: (typeof ATTRIBUTE_ROLES)[number],
  unit: string,
) => {
  if (role === 'variant' && !isVariantAttributeType(type)) {
    throw AppError.validation('A variant attribute must be text, number, or a single select');
  }

  if (unit && type !== 'number') {
    throw AppError.validation('Only number attributes can have a unit');
  }
};

const findAttribute = async (id: string) => {
  const attribute = await AttributeModel.findById(id);

  if (!attribute) {
    throw AppError.notFound('Attribute not found');
  }

  return attribute;
};

const toAssignmentDto = (
  row: AssignmentRecord,
  attribute: AttributeRecord,
  requestedCategoryId: string,
): CategoryAttributeDto => {
  const sourceCategoryId = String(row.categoryId);

  return {
    id: String(row._id),
    sourceCategoryId,
    inherited: sourceCategoryId !== requestedCategoryId,
    isRequired: row.isRequired,
    isFilterable: row.isFilterable,
    sortOrder: row.sortOrder,
    options: isChoiceAttributeType(attribute.type) ? (row.options ?? []).map(toOptionDto) : [],
    attribute: toDto(attribute),
  };
};

const loadEffective = async (categoryId: string) => {
  const category = await CategoryModel.findById(categoryId).select('_id ancestors').lean();

  if (!category) {
    throw AppError.notFound('Category not found');
  }

  const chain = [...category.ancestors, category._id];
  const rows = await CategoryAttributeModel.find({ categoryId: { $in: chain } }).lean();
  const rowsByCategory = new Map<string, AssignmentRecord[]>();

  for (const row of rows) {
    const key = String(row.categoryId);
    const list = rowsByCategory.get(key) ?? [];
    list.push(row);
    rowsByCategory.set(key, list);
  }

  const winners = new Map<string, AssignmentRecord>();

  for (const id of chain) {
    for (const row of rowsByCategory.get(String(id)) ?? []) {
      winners.set(String(row.attributeId), row);
    }
  }

  const attributes = await AttributeModel.find({ _id: { $in: [...winners.keys()] } }).lean();
  const attributesById = new Map(attributes.map((attribute) => [String(attribute._id), attribute]));
  const requestedCategoryId = String(category._id);

  return [...winners.values()]
    .flatMap((row) => {
      const attribute = attributesById.get(String(row.attributeId));

      if (!attribute) {
        return [];
      }

      return [toAssignmentDto(row, attribute, requestedCategoryId)];
    })
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.attribute.name.localeCompare(right.attribute.name),
    );
};

export const attributeService = {
  async create(input: CreateAttributeInput) {
    const unit = input.type === 'number' ? (input.unit ?? '') : '';

    assertRules(input.type, input.role, unit);

    const slug = await resolveSlug(input.slug, input.name);

    try {
      const created = await AttributeModel.create({
        name: input.name,
        slug,
        description: input.description ?? '',
        type: input.type,
        role: input.role,
        unit,
        isFilterable: input.isFilterable ?? true,
        isActive: input.isActive ?? true,
      });

      return toDto(created);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw AppError.conflict('An attribute with this slug already exists');
      }

      throw error;
    }
  },

  async list(query: ListAttributesQuery) {
    const filter: FilterQuery<Attribute> = {};

    if (query.type) {
      filter.type = query.type;
    }

    if (query.role) {
      filter.role = query.role;
    }

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    if (query.search) {
      filter.name = { $regex: escapeRegex(query.search), $options: 'i' };
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      AttributeModel.find(filter).sort(SORTS[query.sort]).skip(skip).limit(query.limit).lean(),
      AttributeModel.countDocuments(filter),
    ]);

    return {
      items: items.map((item) => toDto(item)),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async getById(id: string) {
    const attribute = await findAttribute(id);
    return toDto(attribute);
  },

  async update(id: string, input: UpdateAttributeInput) {
    const attribute = await findAttribute(id);
    const previousType = toType(attribute.type);
    const nextType = input.type ?? previousType;
    const nextRole = input.role ?? toRole(attribute.role);
    const nextUnit = input.unit !== undefined ? input.unit : attribute.unit;
    const crossingToChoice =
      !isChoiceAttributeType(previousType) && isChoiceAttributeType(nextType);
    const crossingToOpen = isChoiceAttributeType(previousType) && !isChoiceAttributeType(nextType);

    if (crossingToChoice) {
      const assigned = await CategoryAttributeModel.exists({ attributeId: attribute._id });

      if (assigned) {
        throw AppError.validation(
          'Add an option list on each category assignment before changing this attribute to a select type',
        );
      }
    }

    if (input.name !== undefined) {
      attribute.name = input.name;
    }

    if (input.slug !== undefined) {
      attribute.slug = await resolveSlug(input.slug, attribute.name, id);
    }

    if (input.description !== undefined) {
      attribute.description = input.description;
    }

    attribute.type = nextType;
    attribute.role = nextRole;
    attribute.unit = nextType === 'number' ? nextUnit : '';

    if (input.isFilterable !== undefined) {
      attribute.isFilterable = input.isFilterable;
    }

    if (input.isActive !== undefined) {
      attribute.isActive = input.isActive;
    }

    assertRules(nextType, nextRole, attribute.unit);

    try {
      await attribute.save();

      if (crossingToOpen) {
        await CategoryAttributeModel.updateMany(
          { attributeId: attribute._id },
          { $set: { options: [] } },
        );
      }
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw AppError.conflict('An attribute with this slug already exists');
      }

      throw error;
    }

    return toDto(attribute);
  },

  async remove(id: string) {
    const attribute = await findAttribute(id);
    const assigned = await CategoryAttributeModel.exists({ attributeId: attribute._id });

    if (assigned) {
      throw AppError.conflict('Remove this attribute from categories before deleting it');
    }

    await attribute.deleteOne();

    return { id: String(attribute._id) };
  },

  async listForCategory(categoryId: string) {
    return loadEffective(categoryId);
  },

  async replaceForCategory(categoryId: string, input: ReplaceCategoryAttributesInput) {
    const category = await CategoryModel.findById(categoryId).select('_id');

    if (!category) {
      throw AppError.notFound('Category not found');
    }

    const ids = input.attributes.map((item) => item.attributeId);
    const attributes = await AttributeModel.find({ _id: { $in: ids } }).select(
      '_id name type isActive isFilterable',
    );
    const attributesById = new Map(
      attributes.map((attribute) => [String(attribute._id), attribute]),
    );
    const existing = await CategoryAttributeModel.find({ categoryId: category._id }).lean();
    const existingByAttributeId = new Map(existing.map((row) => [String(row.attributeId), row]));

    const prepared = input.attributes.map((item) => {
      const attribute = attributesById.get(item.attributeId);

      if (!attribute) {
        throw AppError.badRequest('One or more attributes were not found');
      }

      if (!attribute.isActive) {
        throw AppError.validation('Inactive attributes cannot be assigned');
      }

      const choice = isChoiceAttributeType(attribute.type);
      const requestedOptions = item.options ?? [];

      if (choice && requestedOptions.length === 0) {
        throw AppError.validation(
          `"${attribute.name}" needs at least one option for this category`,
        );
      }

      if (!choice && requestedOptions.length > 0) {
        throw AppError.validation(
          `"${attribute.name}" accepts any value and cannot use a fixed option list`,
        );
      }

      const current = existingByAttributeId.get(item.attributeId);

      return {
        item,
        attribute,
        options: choice ? prepareOptions(requestedOptions, current?.options ?? []) : [],
      };
    });

    const nextIds = new Set(ids);
    const removable = existing
      .filter((row) => !nextIds.has(String(row.attributeId)))
      .map((row) => row.attributeId);

    if (removable.length > 0) {
      await CategoryAttributeModel.deleteMany({
        categoryId: category._id,
        attributeId: { $in: removable },
      });
    }

    await Promise.all(
      prepared.map(({ item, attribute, options }) =>
        CategoryAttributeModel.findOneAndUpdate(
          { categoryId: category._id, attributeId: item.attributeId },
          {
            $set: {
              isRequired: item.isRequired ?? false,
              isFilterable: item.isFilterable ?? attribute.isFilterable ?? true,
              sortOrder: item.sortOrder ?? 0,
              options,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ),
      ),
    );

    return loadEffective(categoryId);
  },
};
