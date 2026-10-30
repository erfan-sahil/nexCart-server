import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const reviewSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'Review',
      default: null,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      maxlength: 600,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

reviewSchema.index(
  { productId: 1, authorId: 1 },
  { unique: true, partialFilterExpression: { parentId: null } },
);
reviewSchema.index(
  { parentId: 1, authorId: 1 },
  { unique: true, partialFilterExpression: { parentId: { $type: 'objectId' } } },
);
reviewSchema.index({ productId: 1, parentId: 1, createdAt: -1 });
reviewSchema.index({ parentId: 1, createdAt: -1 });

export type Review = InferSchemaType<typeof reviewSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ReviewModel = model<Review>('Review', reviewSchema);
