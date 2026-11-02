import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { FULFILLMENT_REJECTION_REASONS } from '../fulfillment/constants';
import { INBOUND_BATCH_STATUSES } from './constants';

const inboundBatchLineSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true, maxlength: 200 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    sentQty: { type: Number, required: true, min: 1 },
    acceptedQty: { type: Number, required: true, min: 0, default: 0 },
    rejectedQty: { type: Number, required: true, min: 0, default: 0 },
    rejectionReason: {
      type: String,
      enum: [...FULFILLMENT_REJECTION_REASONS, null],
      default: null,
    },
    rejectionNote: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: false },
);

const inboundBatchSchema = new Schema(
  {
    vendorOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'VendorOrder',
      required: true,
    },
    parentOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    sequence: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      required: true,
      enum: INBOUND_BATCH_STATUSES,
      default: 'dispatched',
    },
    lines: { type: [inboundBatchLineSchema], required: true },
    dispatchedAt: { type: Date, required: true },
    receivedAt: { type: Date, default: null },
    inspectedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

inboundBatchSchema.index({ vendorOrderId: 1, sequence: 1 }, { unique: true });
inboundBatchSchema.index({ parentOrderId: 1, createdAt: -1 });

export type InboundBatch = InferSchemaType<typeof inboundBatchSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const InboundBatchModel = model<InboundBatch>('InboundBatch', inboundBatchSchema);
