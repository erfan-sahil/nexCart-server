import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import {
  COD_COLLECTION_STATUSES,
  ORDER_CURRENCY,
  ORDER_PAYMENT_METHODS,
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
} from '../modules/orders/constants';

const shippingSchema = new Schema(
  {
    recipientName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    line1: { type: String, required: true, trim: true, maxlength: 160 },
    line2: { type: String, trim: true, maxlength: 160, default: '' },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    postalCode: { type: String, required: true, trim: true, maxlength: 20 },
    country: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { _id: false },
);

const orderItemSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    productName: { type: String, required: true, trim: true, maxlength: 200 },
    storeName: { type: String, required: true, trim: true, maxlength: 120 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const stockReservationSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 32,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ORDER_PAYMENT_METHODS,
    },
    status: {
      type: String,
      required: true,
      enum: ORDER_STATUSES,
      default: 'awaiting_payment',
    },
    paymentStatus: {
      type: String,
      required: true,
      enum: ORDER_PAYMENT_STATUSES,
      default: 'unpaid',
    },
    codCollectionStatus: {
      type: String,
      required: true,
      enum: COD_COLLECTION_STATUSES,
      default: 'not_applicable',
    },
    shipping: { type: shippingSchema, required: true },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    items: { type: [orderItemSchema], required: true },
    stockReservations: { type: [stockReservationSchema], default: [] },
    itemsSubtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    amountDueNow: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, required: true, default: 0, min: 0 },
    balanceDue: { type: Number, required: true, min: 0 },
    refundableAmount: { type: Number, required: true, default: 0, min: 0 },
    currency: {
      type: String,
      required: true,
      default: ORDER_CURRENCY,
      maxlength: 3,
    },
    stockHoldExpiresAt: { type: Date, default: null },
    stockReleasedAt: { type: Date, default: null },
    saleRecordedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ status: 1, stockHoldExpiresAt: 1, stockReleasedAt: 1 });

export type Order = InferSchemaType<typeof orderSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const OrderModel = model<Order>('Order', orderSchema);
