import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { COUPON_DISCOUNT_TYPES } from './constants';

const couponSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 32,
    },
    label: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    discountType: {
      type: String,
      required: true,
      enum: COUPON_DISCOUNT_TYPES,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    minimumSubtotal: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    startsAt: {
      type: Date,
      required: true,
    },
    endsAt: {
      type: Date,
      required: true,
    },
    usageLimit: {
      type: Number,
      default: null,
      min: 1,
    },
    perCustomerLimit: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    usedCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    isEnabled: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

couponSchema.index({ isEnabled: 1, startsAt: 1, endsAt: 1 });

export type Coupon = InferSchemaType<typeof couponSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const CouponModel = model<Coupon>('Coupon', couponSchema);
