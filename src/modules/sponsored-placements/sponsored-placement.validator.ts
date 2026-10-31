import { z } from 'zod';
import { SPONSORED_SECTIONS, SPONSORED_SLOTS } from './constants';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const imageSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value.length === 0 || z.url().safeParse(value).success, {
    message: 'Image must be a valid URL',
  });

export const sponsoredSlotParamsSchema = z.object({
  slot: z.enum(SPONSORED_SLOTS),
});

export const upsertSponsoredPlacementSchema = z.object({
  productId: objectIdSchema,
  section: z.enum(SPONSORED_SECTIONS),
  title: z.string().trim().max(120).optional(),
  subtitle: z.string().trim().max(240).optional(),
  ctaLabel: z.string().trim().max(40).optional(),
  image: imageSchema.optional(),
  isActive: z.boolean(),
});

export type UpsertSponsoredPlacementInput = z.infer<typeof upsertSponsoredPlacementSchema>;
