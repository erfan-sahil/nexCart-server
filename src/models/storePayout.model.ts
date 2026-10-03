import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { PAYOUT_METHODS } from '../constants/store';

const storePayoutSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      unique: true,
    },
    method: {
      type: String,
      required: true,
      enum: PAYOUT_METHODS,
    },
    accountHolderName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    bankName: { type: String, trim: true, maxlength: 80, default: '' },
    provider: { type: String, trim: true, maxlength: 40, default: '' },
    accountNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 34,
    },
    branchName: { type: String, trim: true, maxlength: 80, default: '' },
    routingNumber: { type: String, trim: true, maxlength: 20, default: '' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type StorePayout = InferSchemaType<typeof storePayoutSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const StorePayoutModel = model<StorePayout>('StorePayout', storePayoutSchema);
