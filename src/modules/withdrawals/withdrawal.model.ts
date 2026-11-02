import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

export const WITHDRAWAL_STATUSES = [
  'pending',
  'approved',
  'processing',
  'paid',
  'rejected',
  'cancelled',
] as const;

export const WITHDRAWAL_METHODS = ['bank', 'bkash', 'nagad'] as const;

const withdrawalSchema = new Schema(
  {
    vendorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, required: true, enum: WITHDRAWAL_METHODS },
    accountHolderName: { type: String, required: true, trim: true, maxlength: 120 },
    accountNumber: { type: String, required: true, trim: true, maxlength: 34 },
    bankName: { type: String, trim: true, maxlength: 80, default: '' },
    provider: { type: String, trim: true, maxlength: 40, default: '' },
    status: { type: String, required: true, enum: WITHDRAWAL_STATUSES, default: 'pending' },
    payoutReference: { type: String, trim: true, maxlength: 120, default: '' },
    reviewNote: { type: String, trim: true, maxlength: 500, default: '' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

withdrawalSchema.index({ storeId: 1, createdAt: -1 });
withdrawalSchema.index({ status: 1, createdAt: -1 });

export type Withdrawal = InferSchemaType<typeof withdrawalSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const WithdrawalModel = model<Withdrawal>('Withdrawal', withdrawalSchema);
