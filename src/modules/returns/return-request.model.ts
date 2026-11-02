import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

export const RETURN_STATUSES = [
  'requested',
  'approved',
  'received_at_warehouse',
  'rejected',
  'refunded',
] as const;

export const RETURN_DISPOSITIONS = ['hold', 'restock_at_vendor', 'damaged'] as const;

const returnLineSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    quantity: { type: Number, required: true, min: 1 },
    disposition: {
      type: String,
      required: true,
      enum: RETURN_DISPOSITIONS,
      default: 'hold',
    },
  },
  { _id: false },
);

const returnRequestSchema = new Schema(
  {
    parentOrderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    vendorOrderId: { type: Schema.Types.ObjectId, ref: 'VendorOrder', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    vendorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, required: true, enum: RETURN_STATUSES, default: 'requested' },
    lines: { type: [returnLineSchema], required: true },
    refundAmount: { type: Number, min: 0, default: null },
  },
  { timestamps: true, versionKey: false },
);

returnRequestSchema.index({ vendorOrderId: 1, createdAt: -1 });
returnRequestSchema.index({ parentOrderId: 1, createdAt: -1 });

export type ReturnRequest = InferSchemaType<typeof returnRequestSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ReturnRequestModel = model<ReturnRequest>('ReturnRequest', returnRequestSchema);
