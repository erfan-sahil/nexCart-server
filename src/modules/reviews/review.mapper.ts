import type { Types } from 'mongoose';

import { UserModel } from '../../models/user.model';
import type { Review } from '../../models/review.model';
import type {
  ProductReviewDto,
  RatingDistributionDto,
  ReviewAuthorDto,
  ReviewReplyDto,
  ReviewSummaryDto,
} from './types';

type AuthorRow = {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
};

type ReviewLean = Pick<
  Review,
  '_id' | 'productId' | 'authorId' | 'parentId' | 'rating' | 'body' | 'createdAt' | 'updatedAt'
>;

const displayName = (user: Pick<AuthorRow, 'firstName' | 'lastName'>) =>
  `${user.firstName} ${user.lastName}`.trim();

export const emptyDistribution = (): RatingDistributionDto => ({
  star1: 0,
  star2: 0,
  star3: 0,
  star4: 0,
  star5: 0,
});

export const toReviewSummary = (input: {
  average: number;
  count: number;
  distribution?: Partial<RatingDistributionDto> | null;
}): ReviewSummaryDto => {
  const base = emptyDistribution();
  const distribution = input.distribution ?? {};

  return {
    average: input.average,
    count: input.count,
    distribution: {
      star1: distribution.star1 ?? base.star1,
      star2: distribution.star2 ?? base.star2,
      star3: distribution.star3 ?? base.star3,
      star4: distribution.star4 ?? base.star4,
      star5: distribution.star5 ?? base.star5,
    },
  };
};

export const loadAuthors = async (authorIds: string[]) => {
  const unique = [...new Set(authorIds.filter(Boolean))];

  if (unique.length === 0) {
    return new Map<string, ReviewAuthorDto>();
  }

  const rows = await UserModel.find({ _id: { $in: unique } })
    .select('firstName lastName avatarUrl')
    .lean<AuthorRow[]>();

  return new Map(
    rows.map((row) => [
      String(row._id),
      {
        id: String(row._id),
        displayName: displayName(row),
        avatarUrl: row.avatarUrl ?? '',
      },
    ]),
  );
};

const toReplyDto = (
  row: ReviewLean,
  authors: Map<string, ReviewAuthorDto>,
  viewerId?: string,
): ReviewReplyDto => {
  const author =
    authors.get(String(row.authorId)) ??
    ({
      id: String(row.authorId),
      displayName: 'Customer',
      avatarUrl: '',
    } satisfies ReviewAuthorDto);

  return {
    id: String(row._id),
    author,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isMine: viewerId ? String(row.authorId) === viewerId : false,
  };
};

export const toReviewDto = (
  row: ReviewLean,
  authors: Map<string, ReviewAuthorDto>,
  options: {
    replyCount: number;
    replies: ReviewLean[];
    viewerId?: string;
  },
): ProductReviewDto => {
  const author =
    authors.get(String(row.authorId)) ??
    ({
      id: String(row.authorId),
      displayName: 'Customer',
      avatarUrl: '',
    } satisfies ReviewAuthorDto);

  return {
    id: String(row._id),
    author,
    rating: row.rating ?? 0,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    replyCount: options.replyCount,
    replies: options.replies.map((reply) => toReplyDto(reply, authors, options.viewerId)),
    isMine: options.viewerId ? String(row.authorId) === options.viewerId : false,
  };
};

export const mapReviewTree = async (
  reviews: ReviewLean[],
  replyCounts: Map<string, number>,
  repliesByReview: Map<string, ReviewLean[]>,
  viewerId?: string,
) => {
  const authorIds = [
    ...reviews.map((review) => String(review.authorId)),
    ...[...repliesByReview.values()].flat().map((reply) => String(reply.authorId)),
  ];

  const authors = await loadAuthors(authorIds);

  return reviews.map((review) =>
    toReviewDto(review, authors, {
      replyCount: replyCounts.get(String(review._id)) ?? 0,
      replies: repliesByReview.get(String(review._id)) ?? [],
      viewerId,
    }),
  );
};

export const mapReplies = async (replies: ReviewLean[], viewerId?: string) => {
  const authors = await loadAuthors(replies.map((reply) => String(reply.authorId)));

  return replies.map((reply) => toReplyDto(reply, authors, viewerId));
};
