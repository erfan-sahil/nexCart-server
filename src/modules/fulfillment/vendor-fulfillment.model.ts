import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { VENDOR_FULFILLMENT_STATUSES } from './constants';

const fulfillmentItemSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true, maxlength: 200 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    quantityOrdered: { type: Number, required: true, min: 1 },
    quantityReceived: { type: Number, required: true, default: 0, min: 0 },
    quantityAccepted: { type: Number, required: true, default: 0, min: 0 },
    quantityRejected: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: false },
);

const vendorFulfillmentSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    orderNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 32,
    },
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
    },
    storeName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    vendorUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: VENDOR_FULFILLMENT_STATUSES,
      default: 'pending',
    },
    items: {
      type: [fulfillmentItemSchema],
      required: true,
    },
    itemsSubtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    hasDiscrepancy: {
      type: Boolean,
      required: true,
      default: false,
    },
    inboundCarrier: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    inboundTracking: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    dispatchedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    inspectedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

vendorFulfillmentSchema.index({ storeId: 1, status: 1, createdAt: -1 });
vendorFulfillmentSchema.index({ orderId: 1, storeId: 1 }, { unique: true });
vendorFulfillmentSchema.index({ vendorUserId: 1, createdAt: -1 });

export type VendorFulfillment = InferSchemaType<typeof vendorFulfillmentSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const VendorFulfillmentModel = model<VendorFulfillment>(
  'VendorFulfillment',
  vendorFulfillmentSchema,
);
