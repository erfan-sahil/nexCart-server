import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const addWishlistSchema = z.object({
  productId: objectIdSchema,
});

export const wishlistProductParamsSchema = z.object({
  productId: objectIdSchema,
});

export type AddWishlistInput = z.infer<typeof addWishlistSchema>;
