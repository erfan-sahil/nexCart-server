import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const wishlistItemSchema = new Schema(
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
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

wishlistItemSchema.index({ userId: 1, productId: 1 }, { unique: true });
wishlistItemSchema.index({ userId: 1, createdAt: -1 });

export type WishlistItem = InferSchemaType<typeof wishlistItemSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const WishlistItemModel = model<WishlistItem>('WishlistItem', wishlistItemSchema);
