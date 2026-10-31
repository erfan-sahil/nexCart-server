import { z } from 'zod';
import { FLASH_DEAL_DISCOUNT_TYPES } from './constants';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const updateFlashDealSettingsSchema = z.object({
  sectionTitle: z.string().trim().min(1).max(80),
});

export const createFlashDealSchema = z.object({
  productId: objectIdSchema,
  discountType: z.enum(FLASH_DEAL_DISCOUNT_TYPES),
  discountValue: z.coerce.number().positive(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});

export const updateFlashDealSchema = z
  .object({
    discountType: z.enum(FLASH_DEAL_DISCOUNT_TYPES).optional(),
    discountValue: z.coerce.number().positive().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });

export const flashDealIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const listFlashDealsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'upcoming', 'ended']).default('active'),
});

export type CreateFlashDealInput = z.infer<typeof createFlashDealSchema>;
export type UpdateFlashDealInput = z.infer<typeof updateFlashDealSchema>;
export type ListFlashDealsQuery = z.infer<typeof listFlashDealsQuerySchema>;
export type UpdateFlashDealSettingsInput = z.infer<typeof updateFlashDealSettingsSchema>;
