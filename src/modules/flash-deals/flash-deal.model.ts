import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { FLASH_DEAL_DISCOUNT_TYPES, FLASH_DEAL_SETTINGS_KEY } from './constants';

const flashDealSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    discountType: {
      type: String,
      required: true,
      enum: FLASH_DEAL_DISCOUNT_TYPES,
    },
    discountValue: {
      type: Number,
      required: true,
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
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

flashDealSchema.index({ startsAt: 1, endsAt: 1 });
flashDealSchema.index({ productId: 1, endsAt: 1 });

export type FlashDeal = InferSchemaType<typeof flashDealSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const FlashDealModel = model<FlashDeal>('FlashDeal', flashDealSchema);

const flashDealSettingsSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: FLASH_DEAL_SETTINGS_KEY,
    },
    sectionTitle: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type FlashDealSettings = InferSchemaType<typeof flashDealSettingsSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const FlashDealSettingsModel = model<FlashDealSettings>(
  'FlashDealSettings',
  flashDealSettingsSchema,
);
