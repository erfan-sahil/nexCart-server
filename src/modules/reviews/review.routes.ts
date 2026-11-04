import { Router } from 'express';

import { requirePermissions } from '../../common/middleware/authorize';
import { authenticate, authenticateOptional } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';
import { reviewController, reviewPermissions } from './review.controller';
import {
  createReplySchema,
  createReviewSchema,
  listManagementReviewsQuerySchema,
  listRepliesQuerySchema,
  listReviewsQuerySchema,
  managementReviewIdParamsSchema,
  productIdParamsSchema,
  reviewIdParamsSchema,
  updateReviewSchema,
} from './review.validator';

export const productReviewRouter = Router({ mergeParams: false });

export const adminReviewRouter = Router();

adminReviewRouter.get(
  '/',
  ...requirePermissions(reviewPermissions.admin),
  validate({ query: listManagementReviewsQuerySchema }),
  reviewController.listAdmin,
);

adminReviewRouter.delete(
  '/:reviewId',
  ...requirePermissions(reviewPermissions.admin),
  validate({ params: managementReviewIdParamsSchema }),
  reviewController.removeAdmin,
);

export const vendorReviewRouter = Router();

vendorReviewRouter.get(
  '/',
  ...requirePermissions(reviewPermissions.vendor),
  validate({ query: listManagementReviewsQuerySchema }),
  reviewController.listVendor,
);

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
