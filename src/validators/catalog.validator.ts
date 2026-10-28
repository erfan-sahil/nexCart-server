import { z } from 'zod';
import {
  CATALOG_COLLECTION_PARAMS,
  CATALOG_SORTS,
  MAX_RELATED_PRODUCTS,
  RELATED_PRODUCT_LIMIT,
} from '../constants/catalog';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase and URL-friendly');

export const catalogCollectionParamsSchema = z.object({
  collection: z.enum(CATALOG_COLLECTION_PARAMS),
});

export const listCatalogQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(120).optional(),
    categoryId: objectIdSchema.optional(),
    minPrice: z.coerce.number().finite().min(0).optional(),
    maxPrice: z.coerce.number().finite().min(0).optional(),
    minRating: z.coerce.number().finite().min(0).max(5).optional(),
    sort: z.enum(CATALOG_SORTS).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.minPrice !== undefined &&
      value.maxPrice !== undefined &&
      value.minPrice > value.maxPrice
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['minPrice'],
        message: 'Minimum price cannot be greater than the maximum price',
      });
    }
  });

export const relatedProductsParamsSchema = z.object({
  slug: slugSchema,
});

export const relatedProductsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_RELATED_PRODUCTS).default(RELATED_PRODUCT_LIMIT),
});

export type ListCatalogQuery = z.infer<typeof listCatalogQuerySchema>;
export type RelatedProductsQuery = z.infer<typeof relatedProductsQuerySchema>;
