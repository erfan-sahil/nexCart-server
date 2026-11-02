import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { FULFILLMENT_REJECTION_REASONS } from '../fulfillment/constants';
import { REJECT_RETURN_STATUSES } from './constants';

const rejectReturnLineSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    quantity: { type: Number, required: true, min: 1 },
    rejectionReason: {
      type: String,
      required: true,
      enum: FULFILLMENT_REJECTION_REASONS,
    },
    rejectionNote: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: false },
);

const rejectReturnSchema = new Schema(
  {
    vendorOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'VendorOrder',
      required: true,
    },
    inboundBatchId: {
      type: Schema.Types.ObjectId,
      ref: 'InboundBatch',
      required: true,
    },
    parentOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: REJECT_RETURN_STATUSES,
      default: 'pending_return',
    },
    lines: { type: [rejectReturnLineSchema], required: true },
    sentToVendorAt: { type: Date, default: null },
    receivedByVendorAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

rejectReturnSchema.index({ vendorOrderId: 1, status: 1 });
rejectReturnSchema.index({ inboundBatchId: 1 });

export type RejectReturn = InferSchemaType<typeof rejectReturnSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const RejectReturnModel = model<RejectReturn>('RejectReturn', rejectReturnSchema);
