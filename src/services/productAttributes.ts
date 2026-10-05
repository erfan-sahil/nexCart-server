import { Types } from 'mongoose';
import type { CategoryAttributeDto } from '../types/attribute';
import { AppError } from '../utils/AppError';

export type ProductAttributeInput = {
  attributeId: string;
  text?: string;
  number?: number;
  boolean?: boolean;
  optionIds?: string[];
};

export type StoredProductAttribute = {
  attributeId: Types.ObjectId;
  text: string;
  number: number | null;
  boolean: boolean | null;
  optionIds: Types.ObjectId[];
};

const fail = (index: number, field: string, message: string): never => {
  throw AppError.validation('Validation failed', [
    {
      path: `attributes.${index}.${field}`,
      message,
    },
  ]);
};

const rejectUnused = (
  index: number,
  item: ProductAttributeInput,
  allowed: keyof ProductAttributeInput,
) => {
  const fields = ['text', 'number', 'boolean', 'optionIds'] as const;

  for (const field of fields) {
    if (field !== allowed && item[field] !== undefined) {
      fail(index, field, 'This value does not apply to the attribute type');
    }
  }
};

const emptyValue = (attributeId: string): StoredProductAttribute => ({
  attributeId: new Types.ObjectId(attributeId),
  text: '',
  number: null,
  boolean: null,
  optionIds: [],
});

export const normalizeProductAttributes = (
  input: ProductAttributeInput[],
  assignments: CategoryAttributeDto[],
): StoredProductAttribute[] => {
  const byId = new Map(assignments.map((assignment) => [assignment.attribute.id, assignment]));
  const seen = new Set<string>();

  return input.map((item, index) => {
    if (seen.has(item.attributeId)) {
      return fail(index, 'attributeId', 'Each attribute can be set once');
    }

    seen.add(item.attributeId);

    const assignment = byId.get(item.attributeId);

    if (!assignment) {
      return fail(index, 'attributeId', 'This attribute is not assigned to the product category');
    }

    if (!assignment.attribute.isActive) {
      fail(index, 'attributeId', 'Inactive attributes cannot be used');
    }

    if (assignment.attribute.role !== 'spec') {
      fail(index, 'attributeId', 'Variant attributes are stored on variants, not the product');
    }

    const stored = emptyValue(item.attributeId);
    const type = assignment.attribute.type;

    if (type === 'text') {
      rejectUnused(index, item, 'text');

      if (!item.text) {
        return fail(index, 'text', 'Text is required');
      }

      stored.text = item.text;
      return stored;
    }

    if (type === 'number') {
      rejectUnused(index, item, 'number');

      if (item.number === undefined) {
        return fail(index, 'number', 'A number is required');
      }

      stored.number = item.number;
      return stored;
    }

    if (type === 'boolean') {
      rejectUnused(index, item, 'boolean');

      if (item.boolean === undefined) {
        return fail(index, 'boolean', 'A boolean is required');
      }

      stored.boolean = item.boolean;
      return stored;
    }

    rejectUnused(index, item, 'optionIds');

    const optionIds = item.optionIds ?? [];
    const choices = new Set(
      assignment.options.filter((option) => option.isActive).map((option) => option.id),
    );

    if (choices.size === 0) {
      return fail(index, 'optionIds', `"${assignment.attribute.name}" has no active options`);
    }

    if (type === 'select' && optionIds.length !== 1) {
      return fail(index, 'optionIds', 'Choose one option');
    }

    if (type === 'multiselect' && optionIds.length < 1) {
      return fail(index, 'optionIds', 'Choose at least one option');
    }

    const unique = new Set(optionIds);

    if (unique.size !== optionIds.length || optionIds.some((optionId) => !choices.has(optionId))) {
      return fail(index, 'optionIds', 'One or more options are not available for this category');
    }

    stored.optionIds = optionIds.map((optionId) => new Types.ObjectId(optionId));
    return stored;
  });
};

export const assertRequiredProductAttributes = (
  attributes: { attributeId: { toString(): string } }[],
  assignments: CategoryAttributeDto[],
) => {
  const present = new Set(attributes.map((attribute) => String(attribute.attributeId)));
  const missing = assignments.filter(
    (assignment) =>
      assignment.isRequired &&
      assignment.attribute.isActive &&
      assignment.attribute.role === 'spec' &&
      !present.has(assignment.attribute.id),
  );

  if (missing.length === 0) {
    return;
  }

  const names = missing.map((assignment) => assignment.attribute.name).join(', ');
  throw AppError.validation(`Add required details: ${names}`);
};
