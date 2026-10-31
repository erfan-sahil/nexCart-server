import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { PAYMENT_ATTEMPT_STATUSES, PAYMENT_PURPOSES } from './constants';

const paymentAttemptSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    purpose: {
      type: String,
      required: true,
      enum: PAYMENT_PURPOSES,
    },
    tranId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 64,
    },
    attemptNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      maxlength: 3,
    },
    status: {
      type: String,
      required: true,
      enum: PAYMENT_ATTEMPT_STATUSES,
      default: 'pending',
    },
    sessionKey: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    validationId: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    gatewayStatus: {
      type: String,
      trim: true,
      maxlength: 40,
      default: '',
    },
    gatewayPayload: {
      type: Schema.Types.Mixed,
      default: null,
    },
    mockSignature: {
      type: String,
      trim: true,
      maxlength: 128,
      default: '',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

paymentAttemptSchema.index({ orderId: 1, createdAt: -1 });
paymentAttemptSchema.index({ orderId: 1, status: 1 });
paymentAttemptSchema.index(
  { validationId: 1 },
  { unique: true, partialFilterExpression: { validationId: { $type: 'string' } } },
);

export type PaymentAttempt = InferSchemaType<typeof paymentAttemptSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const PaymentAttemptModel = model<PaymentAttempt>('PaymentAttempt', paymentAttemptSchema);
