import { z } from 'zod';
import { PRODUCT_IMAGE_ID, PRODUCT_STATUSES } from '../constants/product';
import { slugify } from '../utils/slugify';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase and URL-friendly');

const imageIdSchema = z.string().regex(PRODUCT_IMAGE_ID, 'Invalid image id');

const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((value) => slugify(value))
  .refine(
    (value) => value.length >= 2 && value.length <= 32,
    'Tag must contain letters or numbers',
  );

const productSortSchema = z
  .enum(['name', '-name', 'createdAt', '-createdAt', 'rating', '-rating'])
  .default('-createdAt');

const attributeValueSchema = z
  .object({
    attributeId: objectIdSchema,
    text: z.string().trim().min(1).max(500).optional(),
    number: z.number().finite().min(-1_000_000_000).max(1_000_000_000).optional(),
    boolean: z.boolean().optional(),
    optionIds: z.array(objectIdSchema).min(1).max(20).optional(),
  })
  .strict();

const productFields = {
  name: z.string().trim().min(2).max(160),
  slug: slugSchema.optional(),
  shortDescription: z.string().trim().max(300).optional(),
  description: z.string().trim().max(10_000).optional(),
  categoryId: objectIdSchema,
  tags: z.array(tagSchema).max(20).optional(),
  attributes: z.array(attributeValueSchema).max(100).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  isPublished: z.boolean().optional(),
};

const refineProduct = (
  value: {
    tags?: string[];
    attributes?: { attributeId: string; optionIds?: string[] }[];
    status?: (typeof PRODUCT_STATUSES)[number];
    isPublished?: boolean;
  },
  ctx: z.RefinementCtx,
) => {
  if (value.isPublished === true && value.status && value.status !== 'active') {
    ctx.addIssue({
      code: 'custom',
      path: ['isPublished'],
      message: 'Only active products can be published',
    });
  }

  const tags = new Set<string>();

  value.tags?.forEach((tag, index) => {
    if (tags.has(tag)) {
      ctx.addIssue({
        code: 'custom',
        path: ['tags', index],
        message: 'Tags must be unique',
      });
    }

    tags.add(tag);
  });

  const attributes = new Set<string>();

  value.attributes?.forEach((attribute, index) => {
    if (attributes.has(attribute.attributeId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['attributes', index, 'attributeId'],
        message: 'Each attribute can be set once',
      });
    }

    attributes.add(attribute.attributeId);

    const options = new Set<string>();

    attribute.optionIds?.forEach((optionId, optionIndex) => {
      if (options.has(optionId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['attributes', index, 'optionIds', optionIndex],
          message: 'Options must be unique',
        });
      }

      options.add(optionId);
    });
  });
};

export const createProductSchema = z
  .object(productFields)
  .strict()
  .superRefine((value, ctx) => refineProduct(value, ctx));

export const updateProductSchema = z
  .object({
    name: productFields.name.optional(),
    slug: productFields.slug,
    shortDescription: productFields.shortDescription,
    description: productFields.description,
    categoryId: productFields.categoryId.optional(),
    tags: productFields.tags,
    attributes: productFields.attributes,
    status: productFields.status,
    isPublished: productFields.isPublished,
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  })
  .superRefine((value, ctx) => refineProduct(value, ctx));

export const featureProductSchema = z
  .object({
    isFeatured: z.boolean(),
  })
  .strict();

export const thumbnailSchema = z
  .object({
    imageId: imageIdSchema,
  })
  .strict();

const listFields = {
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(80).optional(),
  sort: productSortSchema,
};

export const listPublicProductsQuerySchema = z.object({
  ...listFields,
  categoryId: objectIdSchema.optional(),
  storeId: objectIdSchema.optional(),
  tag: z.string().trim().min(1).max(40).optional(),
  isFeatured: booleanQuery.optional(),
});

export const listMineProductsQuerySchema = z.object({
  ...listFields,
  status: z.enum(PRODUCT_STATUSES).optional(),
  isPublished: booleanQuery.optional(),
});

export const listManageProductsQuerySchema = z.object({
  ...listFields,
  categoryId: objectIdSchema.optional(),
  storeId: objectIdSchema.optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  isPublished: booleanQuery.optional(),
  isFeatured: booleanQuery.optional(),
});

export const productIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const productSlugParamsSchema = z.object({
  slug: slugSchema,
});

export const productImageParamsSchema = z.object({
  id: objectIdSchema,
  imageId: imageIdSchema,
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type FeatureProductInput = z.infer<typeof featureProductSchema>;
export type ThumbnailInput = z.infer<typeof thumbnailSchema>;
export type ListPublicProductsQuery = z.infer<typeof listPublicProductsQuerySchema>;
export type ListMineProductsQuery = z.infer<typeof listMineProductsQuerySchema>;
export type ListManageProductsQuery = z.infer<typeof listManageProductsQuerySchema>;
