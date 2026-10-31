import { z } from 'zod';

import {
  DEFAULT_REPLY_LIMIT,
  DEFAULT_REVIEW_LIMIT,
  DEFAULT_REVIEW_PAGE,
  MAX_REPLY_LIMIT,
  MAX_REVIEW_LIMIT,
  REVIEW_BODY_MAX,
  REVIEW_BODY_MIN,
} from './constants';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const reviewBodySchema = z
  .string()
  .trim()
  .min(REVIEW_BODY_MIN, `Comment must be at least ${REVIEW_BODY_MIN} characters`)
  .max(REVIEW_BODY_MAX, `Comment must be at most ${REVIEW_BODY_MAX} characters`);

export const productIdParamsSchema = z.object({
  productId: objectIdSchema,
});

export const reviewIdParamsSchema = productIdParamsSchema.extend({
  reviewId: objectIdSchema,
});

export const listReviewsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(DEFAULT_REVIEW_PAGE),
  limit: z.coerce.number().int().min(1).max(MAX_REVIEW_LIMIT).default(DEFAULT_REVIEW_LIMIT),
});

export const listRepliesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(DEFAULT_REVIEW_PAGE),
  limit: z.coerce.number().int().min(1).max(MAX_REPLY_LIMIT).default(DEFAULT_REPLY_LIMIT),
});

export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  body: reviewBodySchema,
});

export const updateReviewSchema = z
  .object({
    rating: z.coerce.number().int().min(1).max(5).optional(),
    body: reviewBodySchema.optional(),
  })
  .refine((value) => value.rating !== undefined || value.body !== undefined, {
    message: 'Provide a rating, comment, or both',
  });

export const createReplySchema = z.object({
  body: reviewBodySchema,
});

export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;
export type ListRepliesQuery = z.infer<typeof listRepliesQuerySchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type CreateReplyInput = z.infer<typeof createReplySchema>;
