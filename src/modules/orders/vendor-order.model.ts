import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { VENDOR_ORDER_STATUSES } from './constants';

const vendorOrderItemSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true, maxlength: 200 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const vendorOrderSchema = new Schema(
  {
    parentOrderId: {
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
    vendorOrderNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
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
      enum: VENDOR_ORDER_STATUSES,
      default: 'pending',
    },
    items: {
      type: [vendorOrderItemSchema],
      required: true,
    },
    itemsSubtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

vendorOrderSchema.index({ parentOrderId: 1, storeId: 1 }, { unique: true });
vendorOrderSchema.index({ vendorUserId: 1, status: 1, createdAt: -1 });
vendorOrderSchema.index({ storeId: 1, createdAt: -1 });
vendorOrderSchema.index({ orderNumber: 1 });

export type VendorOrder = InferSchemaType<typeof vendorOrderSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const VendorOrderModel = model<VendorOrder>('VendorOrder', vendorOrderSchema);
