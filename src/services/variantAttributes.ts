import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import type { CategoryAttributeDto } from '../types/attribute';
import { AppError } from '../utils/AppError';

export type VariantAttributeInput = {
  attributeId: string;
  text?: string;
  number?: number;
  optionIds?: string[];
};

export type StoredVariantAttribute = {
  attributeId: Types.ObjectId;
  text: string;
  number: number | null;
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
  item: VariantAttributeInput,
  allowed: keyof VariantAttributeInput,
) => {
  const fields = ['text', 'number', 'optionIds'] as const;

  for (const field of fields) {
    if (field !== allowed && item[field] !== undefined) {
      fail(index, field, 'This value does not apply to the attribute type');
    }
  }
};

export const variantAxes = (assignments: CategoryAttributeDto[]) =>
  assignments.filter(
    (assignment) => assignment.attribute.role === 'variant' && assignment.attribute.isActive,
  );

export const normalizeVariantAttributes = (
  input: VariantAttributeInput[],
  assignments: CategoryAttributeDto[],
): StoredVariantAttribute[] => {
  const axes = variantAxes(assignments);
  const byId = new Map(axes.map((assignment) => [assignment.attribute.id, assignment]));
  const seen = new Set<string>();

  const stored = input.map((item, index) => {
    if (seen.has(item.attributeId)) {
      return fail(index, 'attributeId', 'Each option can be set once');
    }

    seen.add(item.attributeId);

    const assignment = byId.get(item.attributeId);

    if (!assignment) {
      const known = assignments.find((entry) => entry.attribute.id === item.attributeId);

      if (known?.attribute.role === 'spec') {
        return fail(index, 'attributeId', 'Spec attributes belong on the product');
      }

      return fail(index, 'attributeId', 'This option is not assigned to the product category');
    }

    const value: StoredVariantAttribute = {
      attributeId: new Types.ObjectId(item.attributeId),
      text: '',
      number: null,
      optionIds: [],
    };
    const type = assignment.attribute.type;

    if (type === 'text') {
      rejectUnused(index, item, 'text');

      if (!item.text) {
        return fail(index, 'text', 'Text is required');
      }

      value.text = item.text;
      return value;
    }

    if (type === 'number') {
      rejectUnused(index, item, 'number');

      if (item.number === undefined) {
        return fail(index, 'number', 'A number is required');
      }

      value.number = item.number;
      return value;
    }

    if (type !== 'select') {
      return fail(index, 'attributeId', 'This attribute cannot be used on a variant');
    }

    rejectUnused(index, item, 'optionIds');

    const optionIds = item.optionIds ?? [];
    const choices = new Set(
      assignment.options.filter((option) => option.isActive).map((option) => option.id),
    );

    if (choices.size === 0) {
      return fail(index, 'optionIds', `"${assignment.attribute.name}" has no active options`);
    }

    if (optionIds.length !== 1) {
      return fail(index, 'optionIds', 'Choose one option');
    }

    if (!choices.has(optionIds[0] ?? '')) {
      return fail(index, 'optionIds', 'This option is not available for this category');
    }

    value.optionIds = [new Types.ObjectId(optionIds[0])];
    return value;
  });

  const missing = axes.filter((assignment) => !seen.has(assignment.attribute.id));

  if (missing.length > 0) {
    const names = missing.map((assignment) => assignment.attribute.name).join(', ');
    throw AppError.validation(`Set every variant option: ${names}`);
  }

  return stored.sort((left, right) =>
    String(left.attributeId).localeCompare(String(right.attributeId)),
  );
};

const optionToken = (attribute: StoredVariantAttribute) => {
  if (attribute.optionIds.length === 1) {
    return `option:${String(attribute.optionIds[0])}`;
  }

  if (attribute.number !== null) {
    return `number:${attribute.number}`;
  }

  return `text:${attribute.text.trim().toLowerCase()}`;
};

export const variantOptionKey = (attributes: StoredVariantAttribute[]) => {
  const signature = attributes
    .map((attribute) => `${String(attribute.attributeId)}:${optionToken(attribute)}`)
    .join('|');

  return createHash('sha256').update(signature).digest('hex');
};
