import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

export const RETURN_KINDS = ['delivery_failed', 'customer_rejected'] as const;

export const RETURN_STATUSES = [
  'pending_warehouse_receipt',
  'received_at_warehouse',
  'accepted',
  'refund_processing',
  'refunded',
  'damaged',
  'inspection_rejected',
  'closed_without_refund',
  // Legacy statuses kept for existing documents
  'requested',
  'approved',
  'rejected',
] as const;

export const RETURN_LINE_DISPOSITIONS = ['pending', 'sellable', 'damaged'] as const;

const returnLineSchema = new Schema(
  {
    vendorOrderId: { type: Schema.Types.ObjectId, ref: 'VendorOrder', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    vendorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true, maxlength: 200 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    disposition: {
      type: String,
      required: true,
      enum: RETURN_LINE_DISPOSITIONS,
      default: 'pending',
    },
  },
  { _id: false },
);

const returnRequestSchema = new Schema(
  {
    parentOrderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    shipmentId: { type: Schema.Types.ObjectId, ref: 'Shipment', default: null },
    // Legacy single-vendor fields (optional for delivery returns)
    vendorOrderId: { type: Schema.Types.ObjectId, ref: 'VendorOrder', default: null },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', default: null },
    vendorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    kind: {
      type: String,
      required: true,
      enum: RETURN_KINDS,
      default: 'customer_rejected',
    },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: {
      type: String,
      required: true,
      enum: RETURN_STATUSES,
      default: 'pending_warehouse_receipt',
    },
    lines: { type: [returnLineSchema], required: true },
    merchandiseRefund: { type: Number, min: 0, default: 0 },
    couponShare: { type: Number, min: 0, default: 0 },
    deliveryFeeRefund: { type: Number, min: 0, default: 0 },
    cashRefundAmount: { type: Number, min: 0, default: 0 },
    balanceWaivedAmount: { type: Number, min: 0, default: 0 },
    /** Gross customer-facing refund before cash/balance split. */
    refundAmount: { type: Number, min: 0, default: null },
    processedAt: { type: Date, default: null },
    resolvedByAdminId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolutionNote: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true, versionKey: false },
);

returnRequestSchema.index({ storeId: 1, createdAt: -1 });
returnRequestSchema.index({ vendorOrderId: 1, createdAt: -1 });
returnRequestSchema.index({ parentOrderId: 1, createdAt: -1 });
returnRequestSchema.index({ status: 1, createdAt: -1 });
returnRequestSchema.index(
  { shipmentId: 1 },
  { unique: true, partialFilterExpression: { shipmentId: { $type: 'objectId' } } },
);

export type ReturnKind = (typeof RETURN_KINDS)[number];
export type ReturnStatus = (typeof RETURN_STATUSES)[number];
export type ReturnLineDisposition = (typeof RETURN_LINE_DISPOSITIONS)[number];

export type ReturnRequest = InferSchemaType<typeof returnRequestSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ReturnRequestModel = model<ReturnRequest>('ReturnRequest', returnRequestSchema);
