import { z } from 'zod';
import {
  VENDOR_APPLICATION_STATUSES,
  VENDOR_BUSINESS_TYPES,
  VENDOR_DOCUMENT_TYPES,
} from '../constants/vendorApplication';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

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

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

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

const tradeLicenseSchema = z
  .object({
    number: z.string().trim().max(64).optional(),
    documentUrl: z.union([httpUrlSchema, z.literal('')]).optional(),
  })
  .strict();

const taxSchema = z
  .object({
    taxId: z.string().trim().max(64).optional(),
    documentUrl: z.union([httpUrlSchema, z.literal('')]).optional(),
  })
  .strict();

const personalSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    dateOfBirth: dateOnlySchema.optional(),
    address: addressSchema.optional(),
  })
  .strict();

const identitySchema = z
  .object({
    documentType: z.enum(VENDOR_DOCUMENT_TYPES).optional(),
    documentNumber: z
      .string()
      .trim()
      .min(4)
      .max(32)
      .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers, and hyphens only')
      .optional(),
    documentImages: z.array(httpUrlSchema).max(4).optional(),
    selfieUrl: z.union([httpUrlSchema, z.literal('')]).optional(),
  })
  .strict();

const businessSchema = z
  .object({
    storeName: z.string().trim().min(2).max(120).optional(),
    businessType: z.enum(VENDOR_BUSINESS_TYPES).optional(),
    address: addressSchema.optional(),
    tradeLicense: tradeLicenseSchema.nullable().optional(),
    tax: taxSchema.nullable().optional(),
  })
  .strict();

const sellingSchema = z
  .object({
    categoryIds: z.array(objectIdSchema).max(20).optional(),
    description: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
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

const applicationFields = z
  .object({
    personal: personalSchema.optional(),
    identity: identitySchema.optional(),
    business: businessSchema.optional(),
    selling: sellingSchema.optional(),
  })
  .strict();

export const updateVendorApplicationSchema = applicationFields.refine(
  (value) => Object.values(value).some((field) => field !== undefined),
  { message: 'At least one field is required' },
);

const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

export const listVendorApplicationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(VENDOR_APPLICATION_STATUSES).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  includeDrafts: booleanQuery.optional(),
  sort: z
    .enum(['updatedAt', '-updatedAt', 'submittedAt', '-submittedAt', 'createdAt', '-createdAt'])
    .default('-updatedAt'),
});

export const vendorApplicationIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const reviewVendorApplicationSchema = z
  .object({
    note: z.string().trim().max(1000).optional(),
  })
  .strict()
  .default({});

export const vendorApplicationNoteSchema = z
  .object({
    note: z.string().trim().min(5).max(1000),
  })
  .strict();

export type SaveVendorApplicationInput = z.infer<typeof updateVendorApplicationSchema>;
export type ListVendorApplicationsQuery = z.infer<typeof listVendorApplicationsQuerySchema>;
export type ReviewVendorApplicationInput = z.infer<typeof reviewVendorApplicationSchema>;
export type VendorApplicationNoteInput = z.infer<typeof vendorApplicationNoteSchema>;
