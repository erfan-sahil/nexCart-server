import { z } from 'zod';
import { ATTRIBUTE_ROLES, ATTRIBUTE_TYPES, isVariantAttributeType } from '../constants/attribute';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase and URL-friendly');

const optionValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Option value must be lowercase and URL-friendly');

const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

const optionSchema = z.object({
  id: objectIdSchema.optional(),
  label: z.string().trim().min(1).max(80),
  value: optionValueSchema.optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});

const attributeFields = {
  name: z.string().trim().min(2).max(80),
  slug: slugSchema.optional(),
  description: z.string().trim().max(500).optional(),
  type: z.enum(ATTRIBUTE_TYPES),
  role: z.enum(ATTRIBUTE_ROLES),
  unit: z.string().trim().max(16).optional(),
  isFilterable: z.boolean().optional(),
  isActive: z.boolean().optional(),
};

const uniqueOptionValues = (
  options: { label: string; value?: string }[],
  ctx: z.RefinementCtx,
  pathPrefix: (string | number)[],
) => {
  const seen = new Set<string>();

  options.forEach((option, index) => {
    const value = option.value ?? option.label;
    const key = value.trim().toLowerCase();

    if (seen.has(key)) {
      ctx.addIssue({
        code: 'custom',
        path: [...pathPrefix, index, 'value'],
        message: 'Option values must be unique',
      });
    }

    seen.add(key);
  });
};

const refineAttribute = (
  value: {
    type?: (typeof ATTRIBUTE_TYPES)[number];
    role?: (typeof ATTRIBUTE_ROLES)[number];
    unit?: string;
  },
  ctx: z.RefinementCtx,
) => {
  if (value.type && value.role === 'variant' && !isVariantAttributeType(value.type)) {
    ctx.addIssue({
      code: 'custom',
      path: ['type'],
      message: 'A variant attribute must be text, number, or a single select',
    });
  }

  if (value.unit && value.type && value.type !== 'number') {
    ctx.addIssue({
      code: 'custom',
      path: ['unit'],
      message: 'Only number attributes can have a unit',
    });
  }
};

export const createAttributeSchema = z
  .object(attributeFields)
  .strict()
  .superRefine((value, ctx) => refineAttribute(value, ctx));

export const updateAttributeSchema = z
  .object({
    name: attributeFields.name.optional(),
    slug: attributeFields.slug,
    description: attributeFields.description,
    type: attributeFields.type.optional(),
    role: attributeFields.role.optional(),
    unit: attributeFields.unit,
    isFilterable: attributeFields.isFilterable,
    isActive: attributeFields.isActive,
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  })
  .superRefine((value, ctx) => refineAttribute(value, ctx));

export const listAttributesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(ATTRIBUTE_TYPES).optional(),
  role: z.enum(ATTRIBUTE_ROLES).optional(),
  isActive: booleanQuery.optional(),
  search: z.string().trim().min(1).max(80).optional(),
  sort: z.enum(['name', '-name', 'createdAt', '-createdAt']).default('name'),
});

export const attributeIdParamsSchema = z.object({
  id: objectIdSchema,
});

const assignmentSchema = z
  .object({
    attributeId: objectIdSchema,
    isRequired: z.boolean().optional(),
    isFilterable: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    options: z.array(optionSchema).max(100).optional(),
  })
  .strict();

export const replaceCategoryAttributesSchema = z
  .object({
    attributes: z.array(assignmentSchema).max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();

    value.attributes.forEach((item, index) => {
      if (seen.has(item.attributeId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['attributes', index, 'attributeId'],
          message: 'Each attribute can be assigned once',
        });
      }

      seen.add(item.attributeId);

      if (item.options) {
        uniqueOptionValues(item.options, ctx, ['attributes', index, 'options']);
      }
    });
  });

export type CreateAttributeInput = z.infer<typeof createAttributeSchema>;
export type UpdateAttributeInput = z.infer<typeof updateAttributeSchema>;
export type ListAttributesQuery = z.infer<typeof listAttributesQuerySchema>;
export type ReplaceCategoryAttributesInput = z.infer<typeof replaceCategoryAttributesSchema>;
