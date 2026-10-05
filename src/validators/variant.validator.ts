import { z } from 'zod';
import { PRODUCT_IMAGE_ID } from '../constants/product';
import { MAX_VARIANT_PRICE, MAX_VARIANT_STOCK, VARIANT_STATUSES } from '../constants/variant';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const imageIdSchema = z.string().regex(PRODUCT_IMAGE_ID, 'Invalid image id');

const moneySchema = z.number().finite().min(0).max(MAX_VARIANT_PRICE);

const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, 'SKU must use letters, numbers, and hyphens');

const attributeValueSchema = z
  .object({
    attributeId: objectIdSchema,
    text: z.string().trim().min(1).max(500).optional(),
    number: z.number().finite().min(-1_000_000_000).max(1_000_000_000).optional(),
    optionIds: z.array(objectIdSchema).length(1).optional(),
  })
  .strict();

const variantFields = {
  sku: skuSchema,
  price: moneySchema,
  compareAtPrice: moneySchema.nullable().optional(),
  stock: z.number().int().min(0).max(MAX_VARIANT_STOCK).optional(),
  imageId: z.union([imageIdSchema, z.literal('')]).optional(),
  attributes: z.array(attributeValueSchema).max(20).optional(),
  status: z.enum(VARIANT_STATUSES).optional(),
  isDefault: z.boolean().optional(),
};

const refineVariant = (
  value: {
    price?: number;
    compareAtPrice?: number | null;
    attributes?: { attributeId: string }[];
  },
  ctx: z.RefinementCtx,
) => {
  if (
    value.price !== undefined &&
    value.compareAtPrice !== null &&
    value.compareAtPrice !== undefined &&
    value.compareAtPrice <= value.price
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['compareAtPrice'],
      message: 'Compare-at price must be higher than the selling price',
    });
  }

  const attributes = new Set<string>();

  value.attributes?.forEach((attribute, index) => {
    if (attributes.has(attribute.attributeId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['attributes', index, 'attributeId'],
        message: 'Each option can be set once',
      });
    }

    attributes.add(attribute.attributeId);
  });
};

export const createVariantSchema = z
  .object({
    sku: variantFields.sku,
    price: variantFields.price,
    compareAtPrice: variantFields.compareAtPrice,
    stock: variantFields.stock,
    imageId: variantFields.imageId,
    attributes: variantFields.attributes,
    status: variantFields.status,
    isDefault: variantFields.isDefault,
  })
  .strict()
  .superRefine((value, ctx) => refineVariant(value, ctx));

export const updateVariantSchema = z
  .object({
    sku: variantFields.sku.optional(),
    price: variantFields.price.optional(),
    compareAtPrice: variantFields.compareAtPrice,
    stock: variantFields.stock,
    imageId: variantFields.imageId,
    attributes: variantFields.attributes,
    status: variantFields.status,
    isDefault: variantFields.isDefault,
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  })
  .superRefine((value, ctx) => refineVariant(value, ctx));

export const listVariantsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(VARIANT_STATUSES).optional(),
  sort: z
    .enum(['createdAt', '-createdAt', 'price', '-price', 'sku', '-sku', 'stock', '-stock'])
    .default('createdAt'),
});

export const variantParamsSchema = z.object({
  id: objectIdSchema,
  variantId: objectIdSchema,
});

export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type ListVariantsQuery = z.infer<typeof listVariantsQuerySchema>;
