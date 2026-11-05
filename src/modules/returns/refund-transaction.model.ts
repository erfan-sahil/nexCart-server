import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { ORDER_PAYMENT_METHODS } from '../orders/constants';

export const REFUND_TRANSACTION_STATUSES = [
  'recorded',
  'payout_pending',
  'payout_completed',
  'waived_only',
] as const;

const refundTransactionSchema = new Schema(
  {
    parentOrderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    returnId: { type: Schema.Types.ObjectId, ref: 'ReturnRequest', required: true },
    paymentMethod: {
      type: String,
      required: true,
      enum: ORDER_PAYMENT_METHODS,
    },
    merchandiseRefund: { type: Number, required: true, min: 0 },
    couponShare: { type: Number, required: true, min: 0, default: 0 },
    deliveryFeeRefund: { type: Number, required: true, min: 0, default: 0 },
    cashRefundAmount: { type: Number, required: true, min: 0, default: 0 },
    balanceWaivedAmount: { type: Number, required: true, min: 0, default: 0 },
    currency: { type: String, required: true, maxlength: 3, default: 'BDT' },
    status: {
      type: String,
      required: true,
      enum: REFUND_TRANSACTION_STATUSES,
      default: 'recorded',
    },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    idempotencyKey: { type: String, required: true, unique: true, trim: true, maxlength: 255 },
  },
  { timestamps: { createdAt: true, updatedAt: true }, versionKey: false },
);

refundTransactionSchema.index({ parentOrderId: 1, createdAt: -1 });
refundTransactionSchema.index({ returnId: 1 }, { unique: true });
refundTransactionSchema.index({ status: 1, createdAt: -1 });

export type RefundTransactionStatus = (typeof REFUND_TRANSACTION_STATUSES)[number];

export type RefundTransaction = InferSchemaType<typeof refundTransactionSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const RefundTransactionModel = model<RefundTransaction>(
  'RefundTransaction',
  refundTransactionSchema,
);
