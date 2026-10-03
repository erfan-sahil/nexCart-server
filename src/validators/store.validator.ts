import { z } from 'zod';
import { PAYOUT_METHODS } from '../constants/store';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase and URL-friendly');

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address'));

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in international format, for example +8801712345678');

const httpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    const parsed = z.url().safeParse(value);

    return parsed.success && (value.startsWith('https://') || value.startsWith('http://'));
  }, 'Must be an http(s) URL');

const optionalImageSchema = z.union([httpUrlSchema, z.literal('')]);

const addressSchema = z
  .object({
    line1: z.string().trim().min(2).max(160).optional(),
    line2: z.string().trim().max(160).optional(),
    city: z.string().trim().min(2).max(80).optional(),
    state: z.string().trim().min(2).max(80).optional(),
    postalCode: z.string().trim().min(2).max(20).optional(),
    country: z.string().trim().min(2).max(80).optional(),
  })
  .strict();

const contactSchema = z
  .object({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
  })
  .strict();

const accountHolderNameSchema = z.string().trim().min(2).max(120);
const accountNumberSchema = z
  .string()
  .trim()
  .min(6)
  .max(34)
  .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers, and hyphens only');

const bankPayoutSchema = z
  .object({
    method: z.literal(PAYOUT_METHODS[0]),
    accountHolderName: accountHolderNameSchema,
    bankName: z.string().trim().min(2).max(80),
    accountNumber: accountNumberSchema,
    branchName: z.string().trim().min(2).max(80),
    routingNumber: z.string().trim().max(20).optional(),
  })
  .strict();

const mobilePayoutSchema = z
  .object({
    method: z.literal(PAYOUT_METHODS[1]),
    accountHolderName: accountHolderNameSchema,
    provider: z.string().trim().min(2).max(40),
    accountNumber: z.union([phoneSchema, accountNumberSchema]),
  })
  .strict();

export const updateStoreSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    slug: slugSchema.optional(),
    logo: optionalImageSchema.optional(),
    banner: optionalImageSchema.optional(),
    description: z.string().trim().max(2000).optional(),
    contact: contactSchema.optional(),
    address: addressSchema.optional(),
    categoryIds: z.array(objectIdSchema).min(1).max(20).optional(),
    returnPolicy: z.string().trim().max(2000).optional(),
    shippingPolicy: z.string().trim().max(2000).optional(),
    isActive: z.boolean().optional(),
    payout: z.discriminatedUnion('method', [bankPayoutSchema, mobilePayoutSchema]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!Object.values(value).some((field) => field !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'At least one field is required',
      });
    }

    if (!value.categoryIds) {
      return;
    }

    const seen = new Set<string>();

    value.categoryIds.forEach((categoryId, index) => {
      if (seen.has(categoryId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['categoryIds', index],
          message: 'Each category can be selected once',
        });
      }

      seen.add(categoryId);
    });
  });

export const listStoresQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  categoryId: objectIdSchema.optional(),
  sort: z
    .enum(['name', '-name', 'joinedAt', '-joinedAt', 'rating', '-rating'])
    .default('-joinedAt'),
});

export const storeIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const storeSlugParamsSchema = z.object({
  slug: slugSchema,
});

export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
export type ListStoresQuery = z.infer<typeof listStoresQuerySchema>;
export type SaveStorePayoutInput = NonNullable<UpdateStoreInput['payout']>;
