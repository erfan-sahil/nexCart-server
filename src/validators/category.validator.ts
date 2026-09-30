import { z } from 'zod';
import { CATEGORY_LEVELS } from '../constants/category';
import type { CategoryLevel } from '../types/category';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase and URL-friendly');

const imageSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value.length === 0 || z.url().safeParse(value).success, {
    message: 'Image must be a valid URL',
  });

const levelSchema = z.union([
  z.literal(CATEGORY_LEVELS[0]),
  z.literal(CATEGORY_LEVELS[1]),
  z.literal(CATEGORY_LEVELS[2]),
]);

const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slugSchema.optional(),
  description: z.string().trim().max(1000).optional(),
  image: imageSchema.optional(),
  parentId: objectIdSchema.nullable().optional(),
  level: levelSchema.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(1000).optional(),
    image: imageSchema.optional(),
    parentId: objectIdSchema.nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });

export const listCategoriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  level: z
    .enum(['1', '2', '3'])
    .transform((value) => Number(value) as CategoryLevel)
    .optional(),
  parentId: objectIdSchema.optional(),
  isActive: booleanQuery.optional(),
  search: z.string().trim().min(1).max(80).optional(),
  sort: z
    .enum(['sortOrder', '-sortOrder', 'name', '-name', 'createdAt', '-createdAt'])
    .default('sortOrder'),
});

export const treeCategoriesQuerySchema = z.object({
  isActive: booleanQuery.optional(),
});

export const categoryIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const categorySlugParamsSchema = z.object({
  slug: slugSchema,
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
export type TreeCategoriesQuery = z.infer<typeof treeCategoriesQuerySchema>;
