export type ReviewAuthorDto = {
  id: string;
  displayName: string;
  avatarUrl: string;
};

export type ReviewReplyDto = {
  id: string;
  author: ReviewAuthorDto;
  body: string;
  createdAt: string;
  updatedAt: string;
  isMine: boolean;
};

export type ProductReviewDto = {
  id: string;
  author: ReviewAuthorDto;
  rating: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
  replies: ReviewReplyDto[];
  isMine: boolean;
};

export type RatingDistributionDto = {
  star1: number;
  star2: number;
  star3: number;
  star4: number;
  star5: number;
};

export type ReviewSummaryDto = {
  average: number;
  count: number;
  distribution: RatingDistributionDto;
};

export type ReviewListPayload = {
  summary: ReviewSummaryDto;
  reviews: ProductReviewDto[];
  mine: ProductReviewDto | null;
};

export type ReplyListPayload = {
  replies: ReviewReplyDto[];
};
