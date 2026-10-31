import type { Request, Response } from 'express';

import { Permission } from '../../common/constants/permissions';
import { asyncHandler } from '../../common/http/asyncHandler';
import { AppError } from '../../common/errors/AppError';
import { sendCreated, sendSuccess } from '../../common/http/sendResponse';
import { reviewService } from './review.service';
import type {
  CreateReplyInput,
  CreateReviewInput,
  ListRepliesQuery,
  ListReviewsQuery,
  UpdateReviewInput,
} from './review.validator';

const param = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const viewerId = (req: Request) => req.auth?.user.id;

const actorId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const list = asyncHandler(async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const query = req.query as unknown as ListReviewsQuery;
  const { payload, total } = await reviewService.list(productId, query, viewerId(req));

  sendSuccess(res, payload, {
    message: 'Reviews',
    meta: {
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: query.limit > 0 ? Math.ceil(total / query.limit) : 0,
      },
    },
  });
});

const listReplies = asyncHandler(async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const reviewId = param(req.params.reviewId);
  const query = req.query as unknown as ListRepliesQuery;
  const { payload, total } = await reviewService.listReplies(
    productId,
    reviewId,
    query,
    viewerId(req),
  );

  sendSuccess(res, payload, {
    message: 'Replies',
    meta: {
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: query.limit > 0 ? Math.ceil(total / query.limit) : 0,
      },
    },
  });
});

const create = asyncHandler(async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const body = req.body as CreateReviewInput;
  const result = await reviewService.create(productId, actorId(req), body);

  sendCreated(res, result, 'Review posted');
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const reviewId = param(req.params.reviewId);
  const body = req.body as UpdateReviewInput;
  const result = await reviewService.update(productId, reviewId, actorId(req), body);

  sendSuccess(res, result, { message: 'Review updated' });
});

const remove = asyncHandler(async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const reviewId = param(req.params.reviewId);
  const result = await reviewService.remove(productId, reviewId, actorId(req));

  sendSuccess(res, result, { message: 'Review deleted' });
});

const createReply = asyncHandler(async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const reviewId = param(req.params.reviewId);
  const body = req.body as CreateReplyInput;
  const result = await reviewService.createReply(productId, reviewId, actorId(req), body);

  sendCreated(res, result, 'Reply posted');
});

export const reviewController = {
  list,
  listReplies,
  create,
  update,
  remove,
  createReply,
};

export const reviewPermissions = {
  create: Permission.customerReviews,
};
