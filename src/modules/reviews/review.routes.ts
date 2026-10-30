import { Router } from 'express';

import { requirePermissions } from '../../middleware/authorize';
import { authenticate, authenticateOptional } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { reviewController, reviewPermissions } from './review.controller';
import {
  createReplySchema,
  createReviewSchema,
  listRepliesQuerySchema,
  listReviewsQuerySchema,
  productIdParamsSchema,
  reviewIdParamsSchema,
  updateReviewSchema,
} from './review.validator';

export const productReviewRouter = Router({ mergeParams: false });

productReviewRouter.get(
  '/:productId/reviews',
  authenticateOptional,
  validate({ params: productIdParamsSchema, query: listReviewsQuerySchema }),
  reviewController.list,
);

productReviewRouter.get(
  '/:productId/reviews/:reviewId/replies',
  authenticateOptional,
  validate({ params: reviewIdParamsSchema, query: listRepliesQuerySchema }),
  reviewController.listReplies,
);

productReviewRouter.post(
  '/:productId/reviews',
  ...requirePermissions(reviewPermissions.create),
  validate({ params: productIdParamsSchema, body: createReviewSchema }),
  reviewController.create,
);

productReviewRouter.patch(
  '/:productId/reviews/:reviewId',
  authenticate,
  validate({ params: reviewIdParamsSchema, body: updateReviewSchema }),
  reviewController.update,
);

productReviewRouter.delete(
  '/:productId/reviews/:reviewId',
  authenticate,
  validate({ params: reviewIdParamsSchema }),
  reviewController.remove,
);

productReviewRouter.post(
  '/:productId/reviews/:reviewId/replies',
  authenticate,
  validate({ params: reviewIdParamsSchema, body: createReplySchema }),
  reviewController.createReply,
);
