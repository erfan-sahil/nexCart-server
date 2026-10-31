import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const recentlyViewedItemSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    viewedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

recentlyViewedItemSchema.index({ userId: 1, productId: 1 }, { unique: true });
recentlyViewedItemSchema.index({ userId: 1, viewedAt: -1 });

export type RecentlyViewedItem = InferSchemaType<typeof recentlyViewedItemSchema> & {
  _id: Types.ObjectId;
};

export const RecentlyViewedItemModel = model<RecentlyViewedItem>(
  'RecentlyViewedItem',
  recentlyViewedItemSchema,
);
