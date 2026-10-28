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

const discountTypeSchema = z.enum(['percent', 'amount']).nullable().optional();

const discountValueSchema = z.number().finite().min(0).max(MAX_VARIANT_PRICE).nullable().optional();

const variantFields = {
  sku: skuSchema,
  price: moneySchema,
  discountType: discountTypeSchema,
  discountValue: discountValueSchema,
  stock: z.number().int().min(0).max(MAX_VARIANT_STOCK).optional(),
  imageId: z.union([imageIdSchema, z.literal('')]).optional(),
  attributes: z.array(attributeValueSchema).max(20).optional(),
  status: z.enum(VARIANT_STATUSES).optional(),
  isDefault: z.boolean().optional(),
  simple: z.boolean().optional(),
};

const refineVariant = (
  value: {
    price?: number;
    discountType?: 'percent' | 'amount' | null;
    discountValue?: number | null;
    attributes?: { attributeId: string }[];
    simple?: boolean;
  },
  ctx: z.RefinementCtx,
) => {
  const type = value.discountType;
  const discount = value.discountValue;
  const hasType = type === 'percent' || type === 'amount';
  const hasValue = typeof discount === 'number';

  if (hasType && !hasValue) {
    ctx.addIssue({
      code: 'custom',
      path: ['discountValue'],
      message: 'Enter a discount',
    });
  }

  if (!hasType && hasValue && type !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['discountType'],
      message: 'Choose percentage or amount',
    });
  }

  if (type === null && hasValue) {
    ctx.addIssue({
      code: 'custom',
      path: ['discountValue'],
      message: 'Clear the discount when no discount type is selected',
    });
  }

  if (hasType && hasValue && discount <= 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['discountValue'],
      message: 'Enter a discount greater than 0',
    });
  }

  if (type === 'percent' && hasValue && discount > 100) {
    ctx.addIssue({
      code: 'custom',
      path: ['discountValue'],
      message: 'Percentage discount cannot be more than 100',
    });
  }

  if (type === 'amount' && hasValue && value.price !== undefined && discount > value.price) {
    ctx.addIssue({
      code: 'custom',
      path: ['discountValue'],
      message: 'Discount amount cannot be more than the original price',
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

  if (value.simple === true && (value.attributes?.length ?? 0) > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['attributes'],
      message: 'A product without options cannot set variant options',
    });
  }
};

export const createVariantSchema = z
  .object({
    sku: variantFields.sku,
    price: variantFields.price,
    discountType: variantFields.discountType,
    discountValue: variantFields.discountValue,
    stock: variantFields.stock,
    imageId: variantFields.imageId,
    attributes: variantFields.attributes,
    status: variantFields.status,
    isDefault: variantFields.isDefault,
    simple: variantFields.simple,
  })
  .strict()
  .superRefine((value, ctx) => refineVariant(value, ctx));

export const updateVariantSchema = z
  .object({
    sku: variantFields.sku.optional(),
    price: variantFields.price.optional(),
    discountType: variantFields.discountType,
    discountValue: variantFields.discountValue,
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
