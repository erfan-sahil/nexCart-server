import { Types } from 'mongoose';

import type { Review } from './review.model';
import { ProductModel } from '../products/product.model';
import { ReviewModel } from './review.model';
import { StoreModel } from '../stores/store.model';
import { AppError } from '../../common/errors/AppError';
import { isDuplicateKeyError } from '../../common/errors/mongoError';
import { INITIAL_REPLIES_PER_REVIEW } from './constants';
import {
  emptyDistribution,
  mapManagementReviews,
  mapReplies,
  mapReviewTree,
  toReviewSummary,
} from './review.mapper';
import type {
  CreateReplyInput,
  CreateReviewInput,
  ListManagementReviewsQuery,
  ListRepliesQuery,
  ListReviewsQuery,
  UpdateReviewInput,
} from './review.validator';
import type {
  ProductReviewDto,
  ReplyListPayload,
  ReviewListPayload,
  ReviewManagementItemDto,
} from './types';

const isStoreListed = (store: { isActive: boolean; suspendedAt?: Date | null } | null) =>
  Boolean(store?.isActive && !store.suspendedAt);

const isProductListed = (product: {
  approvalStatus: string;
  status: string;
  isPublished: boolean;
}) => product.approvalStatus === 'approved' && product.status === 'active' && product.isPublished;

const toObjectId = (value: string) => new Types.ObjectId(value);

const roundAverage = (sum: number, count: number) => {
  if (count === 0) {
    return 0;
  }

  return Math.round((sum / count) * 10) / 10;
};

const syncProductRatingSummary = async (productId: string) => {
  const oid = toObjectId(productId);

  const [stats] = await ReviewModel.aggregate<{
    count: number;
    sum: number;
    star1: number;
    star2: number;
    star3: number;
    star4: number;
    star5: number;
  }>([
    { $match: { productId: oid, parentId: null } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        sum: { $sum: '$rating' },
        star1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        star2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        star3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        star4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        star5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
      },
    },
  ]);

  const count = stats?.count ?? 0;
  const distribution = emptyDistribution();

  if (stats) {
    distribution.star1 = stats.star1;
    distribution.star2 = stats.star2;
    distribution.star3 = stats.star3;
    distribution.star4 = stats.star4;
    distribution.star5 = stats.star5;
  }

  const average = roundAverage(stats?.sum ?? 0, count);

  await ProductModel.updateOne(
    { _id: oid },
    {
      $set: {
        ratingSummary: {
          average,
          count,
          distribution,
        },
      },
    },
  );

  return toReviewSummary({ average, count, distribution });
};

const assertListedProduct = async (productId: string) => {
  const product = await ProductModel.findById(productId)
    .select('approvalStatus status isPublished storeId ratingSummary')
    .lean();

  if (!product) {
    throw AppError.notFound('Product not found');
  }

  const store = await StoreModel.findById(product.storeId).select('isActive suspendedAt').lean();

  if (!isProductListed(product) || !isStoreListed(store)) {
    throw AppError.notFound('Product not found');
  }

  return product;
};

const resolveVendorStoreId = async (userId: string) => {
  const store = await StoreModel.findOne({ userId }).select('_id').lean();

  if (!store) {
    return null;
  }

  return String(store._id);
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const productIdsForStore = async (storeId: string) => {
  const products = await ProductModel.find({ storeId }).select('_id').lean();
  return products.map((product) => String(product._id));
};

const productIdsMatchingSearch = async (search: string, storeId?: string) => {
  const filter: Record<string, unknown> = {
    name: { $regex: escapeRegex(search), $options: 'i' },
  };

  if (storeId) {
    filter.storeId = toObjectId(storeId);
  }

  const products = await ProductModel.find(filter).select('_id').lean();
  return products.map((product) => String(product._id));
};

const buildManagementFilter = async (
  query: ListManagementReviewsQuery,
  options: { storeId?: string | null } = {},
) => {
  const filter: Record<string, unknown> = { parentId: null };

  if (query.rating !== undefined) {
    filter.rating = query.rating;
  }

  if (options.storeId === null) {
    return { filter: null as Record<string, unknown> | null };
  }

  let scopedProductIds: string[] | undefined;

  if (options.storeId) {
    scopedProductIds = await productIdsForStore(options.storeId);

    if (scopedProductIds.length === 0) {
      return { filter: null };
    }
  }

  if (query.storeId && !options.storeId) {
    const storeProductIds = await productIdsForStore(query.storeId);

    if (storeProductIds.length === 0) {
      return { filter: null };
    }

    scopedProductIds = storeProductIds;
  }

  if (query.productId) {
    if (scopedProductIds && !scopedProductIds.includes(query.productId)) {
      return { filter: null };
    }

    filter.productId = toObjectId(query.productId);
  } else if (scopedProductIds) {
    filter.productId = { $in: scopedProductIds.map(toObjectId) };
  }

  if (query.search) {
    const matchedProductIds = await productIdsMatchingSearch(
      query.search,
      options.storeId ?? query.storeId,
    );
    const bodyClause = { body: { $regex: escapeRegex(query.search), $options: 'i' } };
    const productClause =
      matchedProductIds.length > 0
        ? { productId: { $in: matchedProductIds.map(toObjectId) } }
        : null;

    if (productClause) {
      filter.$or = [bodyClause, productClause];
    } else {
      Object.assign(filter, bodyClause);
    }
  }

  return { filter };
};

const loadTopLevelReview = async (productId: string, reviewId: string) => {
  const review = await ReviewModel.findOne({
    _id: reviewId,
    productId,
    parentId: null,
  }).lean();

  if (!review) {
    throw AppError.notFound('Review not found');
  }

  return review;
};

const loadOwnedReview = async (productId: string, reviewId: string, userId: string) => {
  const review = await ReviewModel.findOne({
    _id: reviewId,
    productId,
  }).lean();

  if (!review) {
    throw AppError.notFound('Review not found');
  }

  if (String(review.authorId) !== userId) {
    throw AppError.forbidden('You can only change your own comment');
  }

  return review;
};

const replyCountsFor = async (reviewIds: string[]) => {
  if (reviewIds.length === 0) {
    return new Map<string, number>();
  }

  const rows = await ReviewModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { parentId: { $in: reviewIds.map(toObjectId) } } },
    { $group: { _id: '$parentId', count: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), row.count]));
};

type ReviewRow = Pick<
  Review,
  '_id' | 'productId' | 'authorId' | 'parentId' | 'rating' | 'body' | 'createdAt' | 'updatedAt'
>;

const repliesForReviews = async (reviewIds: string[], limitPerReview: number) => {
  if (reviewIds.length === 0) {
    return new Map<string, ReviewRow[]>();
  }

  const rows = await ReviewModel.find({ parentId: { $in: reviewIds.map(toObjectId) } })
    .sort({ createdAt: 1 })
    .lean<ReviewRow[]>();

  const grouped = new Map<string, ReviewRow[]>();

  for (const row of rows) {
    const key = String(row.parentId);
    const bucket = grouped.get(key) ?? [];

    if (bucket.length < limitPerReview) {
      bucket.push(row);
      grouped.set(key, bucket);
    }
  }

  return grouped;
};

const presentMine = async (
  productId: string,
  viewerId?: string,
): Promise<ProductReviewDto | null> => {
  if (!viewerId) {
    return null;
  }

  const mine = await ReviewModel.findOne({
    productId,
    authorId: viewerId,
    parentId: null,
  }).lean();

  if (!mine) {
    return null;
  }

  const reviewId = String(mine._id);
  const replyCounts = await replyCountsFor([reviewId]);
  const repliesByReview = await repliesForReviews([reviewId], INITIAL_REPLIES_PER_REVIEW);
  const [mapped] = await mapReviewTree([mine], replyCounts, repliesByReview, viewerId);

  return mapped ?? null;
};

const list = async (
  productId: string,
  query: ListReviewsQuery,
  viewerId?: string,
): Promise<{ payload: ReviewListPayload; total: number }> => {
  const product = await assertListedProduct(productId);
  const skip = (query.page - 1) * query.limit;

  const [total, reviews] = await Promise.all([
    ReviewModel.countDocuments({ productId, parentId: null }),
    ReviewModel.find({ productId, parentId: null })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .lean(),
  ]);

  const reviewIds = reviews.map((review) => String(review._id));
  const [replyCounts, repliesByReview] = await Promise.all([
    replyCountsFor(reviewIds),
    repliesForReviews(reviewIds, INITIAL_REPLIES_PER_REVIEW),
  ]);

  const mapped = await mapReviewTree(reviews, replyCounts, repliesByReview, viewerId);
  const mine = await presentMine(productId, viewerId);

  const summary = toReviewSummary({
    average: product.ratingSummary?.average ?? 0,
    count: product.ratingSummary?.count ?? 0,
    distribution: product.ratingSummary?.distribution,
  });

  return {
    payload: {
      summary,
      reviews: mapped,
      mine,
    },
    total,
  };
};

const listReplies = async (
  productId: string,
  reviewId: string,
  query: ListRepliesQuery,
  viewerId?: string,
): Promise<{ payload: ReplyListPayload; total: number }> => {
  await assertListedProduct(productId);
  await loadTopLevelReview(productId, reviewId);

  const skip = (query.page - 1) * query.limit;
  const filter = { productId, parentId: reviewId };

  const [total, replies] = await Promise.all([
    ReviewModel.countDocuments(filter),
    ReviewModel.find(filter).sort({ createdAt: 1 }).skip(skip).limit(query.limit).lean(),
  ]);

  return {
    payload: {
      replies: await mapReplies(replies, viewerId),
    },
    total,
  };
};

const create = async (productId: string, userId: string, input: CreateReviewInput) => {
  await assertListedProduct(productId);

  try {
    const review = await ReviewModel.create({
      productId,
      authorId: userId,
      parentId: null,
      rating: input.rating,
      body: input.body,
    });

    const summary = await syncProductRatingSummary(productId);
    const [mapped] = await mapReviewTree([review.toObject()], new Map(), new Map(), userId);

    return { review: mapped!, summary };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw AppError.conflict('You already reviewed this product');
    }

    throw error;
  }
};

const update = async (
  productId: string,
  reviewId: string,
  userId: string,
  input: UpdateReviewInput,
) => {
  const existing = await loadOwnedReview(productId, reviewId, userId);

  if (existing.parentId) {
    if (input.rating !== undefined) {
      throw AppError.badRequest('Replies cannot include a rating');
    }

    if (input.body === undefined) {
      throw AppError.badRequest('Provide an updated comment');
    }

    await ReviewModel.updateOne({ _id: reviewId }, { $set: { body: input.body } });

    const updated = await ReviewModel.findById(reviewId).lean();

    if (!updated) {
      throw AppError.notFound('Review not found');
    }

    const replies = await mapReplies([updated], userId);

    return { reply: replies[0]!, summary: null };
  }

  const updates: { rating?: number; body?: string } = {};

  if (input.rating !== undefined) {
    updates.rating = input.rating;
  }

  if (input.body !== undefined) {
    updates.body = input.body;
  }

  await ReviewModel.updateOne({ _id: reviewId }, { $set: updates });

  const review = await ReviewModel.findById(reviewId).lean();

  if (!review) {
    throw AppError.notFound('Review not found');
  }

  const summary = await syncProductRatingSummary(productId);
  const replyCounts = await replyCountsFor([reviewId]);
  const repliesByReview = await repliesForReviews([reviewId], INITIAL_REPLIES_PER_REVIEW);
  const [mapped] = await mapReviewTree([review], replyCounts, repliesByReview, userId);

  return { review: mapped!, summary };
};

const remove = async (productId: string, reviewId: string, userId: string) => {
  const existing = await loadOwnedReview(productId, reviewId, userId);

  if (existing.parentId) {
    await ReviewModel.deleteOne({ _id: reviewId });
    return { summary: null };
  }

  await ReviewModel.deleteMany({
    $or: [{ _id: reviewId }, { parentId: reviewId }],
  });

  const summary = await syncProductRatingSummary(productId);

  return { summary };
};

const createReply = async (
  productId: string,
  reviewId: string,
  userId: string,
  input: CreateReplyInput,
) => {
  const vendorStoreId = await resolveVendorStoreId(userId);

  if (vendorStoreId) {
    const product = await ProductModel.findById(productId).select('storeId').lean();

    if (!product) {
      throw AppError.notFound('Product not found');
    }

    if (String(product.storeId) !== vendorStoreId) {
      throw AppError.forbidden('You can only reply to reviews on your products');
    }
  } else {
    await assertListedProduct(productId);
  }

  await loadTopLevelReview(productId, reviewId);

  try {
    const reply = await ReviewModel.create({
      productId,
      authorId: userId,
      parentId: reviewId,
      rating: null,
      body: input.body,
    });

    const replies = await mapReplies([reply.toObject()], userId);

    return { reply: replies[0]! };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw AppError.conflict('You already replied to this review');
    }

    throw error;
  }
};

const listManagement = async (
  query: ListManagementReviewsQuery,
  viewerId: string,
  options: { storeId?: string | null } = {},
): Promise<{ items: ReviewManagementItemDto[]; total: number; page: number; limit: number }> => {
  const { filter } = await buildManagementFilter(query, options);

  if (!filter) {
    return { items: [], total: 0, page: query.page, limit: query.limit };
  }

  const skip = (query.page - 1) * query.limit;

  const [total, reviews] = await Promise.all([
    ReviewModel.countDocuments(filter),
    ReviewModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
  ]);

  const reviewIds = reviews.map((review) => String(review._id));
  const [replyCounts, repliesByReview] = await Promise.all([
    replyCountsFor(reviewIds),
    repliesForReviews(reviewIds, INITIAL_REPLIES_PER_REVIEW),
  ]);

  return {
    items: await mapManagementReviews(reviews, replyCounts, repliesByReview, viewerId),
    total,
    page: query.page,
    limit: query.limit,
  };
};

const listForAdmin = async (query: ListManagementReviewsQuery, viewerId: string) =>
  listManagement(query, viewerId);

const listForVendor = async (
  userId: string,
  query: ListManagementReviewsQuery,
): Promise<{ items: ReviewManagementItemDto[]; total: number; page: number; limit: number }> => {
  const storeId = await resolveVendorStoreId(userId);

  if (!storeId) {
    return { items: [], total: 0, page: query.page, limit: query.limit };
  }

  return listManagement(query, userId, { storeId });
};

const removeByAdmin = async (reviewId: string) => {
  const existing = await ReviewModel.findById(reviewId).lean();

  if (!existing) {
    throw AppError.notFound('Review not found');
  }

  if (existing.parentId) {
    await ReviewModel.deleteOne({ _id: reviewId });
    return { summary: null };
  }

  const productId = String(existing.productId);

  await ReviewModel.deleteMany({
    $or: [{ _id: reviewId }, { parentId: reviewId }],
  });

  const summary = await syncProductRatingSummary(productId);

  return { summary };
};

export const reviewService = {
  list,
  listReplies,
  create,
  update,
  remove,
  createReply,
  listForAdmin,
  listForVendor,
  removeByAdmin,
};
