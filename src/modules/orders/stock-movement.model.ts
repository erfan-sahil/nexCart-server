import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { STOCK_CUSTODIES, STOCK_MOVEMENT_DIRECTIONS } from './constants';

const stockMovementSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    variantId: {
      type: Schema.Types.ObjectId,
      ref: 'ProductVariant',
      required: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    direction: {
      type: String,
      required: true,
      enum: STOCK_MOVEMENT_DIRECTIONS,
    },
    custody: {
      type: String,
      required: true,
      enum: STOCK_CUSTODIES,
    },
    reason: { type: String, required: true, trim: true, maxlength: 120 },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 255,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

stockMovementSchema.index({ orderId: 1, createdAt: -1 });

export type StockMovement = InferSchemaType<typeof stockMovementSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const StockMovementModel = model<StockMovement>('StockMovement', stockMovementSchema);
