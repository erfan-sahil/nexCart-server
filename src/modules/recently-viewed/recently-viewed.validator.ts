import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const recordRecentlyViewedSchema = z.object({
  productId: objectIdSchema,
});

export const recentlyViewedProductParamsSchema = z.object({
  productId: objectIdSchema,
});

export type RecordRecentlyViewedInput = z.infer<typeof recordRecentlyViewedSchema>;
