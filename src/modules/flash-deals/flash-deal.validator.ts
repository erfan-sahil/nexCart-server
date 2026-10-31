import { z } from 'zod';
import { FLASH_DEAL_DISCOUNT_TYPES } from './constants';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const createFlashDealCampaignSchema = z.object({
  name: z.string().trim().min(1).max(80),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});

export const updateFlashDealCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });

export const createFlashDealItemSchema = z.object({
  productId: objectIdSchema,
  discountType: z.enum(FLASH_DEAL_DISCOUNT_TYPES),
  discountValue: z.coerce.number().positive(),
});

export const updateFlashDealItemSchema = z
  .object({
    discountType: z.enum(FLASH_DEAL_DISCOUNT_TYPES).optional(),
    discountValue: z.coerce.number().positive().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });

export const flashDealIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const flashDealItemParamsSchema = z.object({
  id: objectIdSchema,
  itemId: objectIdSchema,
});

export const listFlashDealsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'upcoming', 'ended']).default('active'),
});

export type CreateFlashDealCampaignInput = z.infer<typeof createFlashDealCampaignSchema>;
export type UpdateFlashDealCampaignInput = z.infer<typeof updateFlashDealCampaignSchema>;
export type CreateFlashDealItemInput = z.infer<typeof createFlashDealItemSchema>;
export type UpdateFlashDealItemInput = z.infer<typeof updateFlashDealItemSchema>;
export type ListFlashDealsQuery = z.infer<typeof listFlashDealsQuerySchema>;
