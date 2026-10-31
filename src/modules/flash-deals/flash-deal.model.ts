import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { FLASH_DEAL_DISCOUNT_TYPES, FLASH_DEAL_SETTINGS_KEY } from './constants';

const flashDealCampaignSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
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

flashDealCampaignSchema.index({ startsAt: 1, endsAt: 1 });

export type FlashDealCampaign = InferSchemaType<typeof flashDealCampaignSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const FlashDealCampaignModel = model<FlashDealCampaign>(
  'FlashDealCampaign',
  flashDealCampaignSchema,
);

const flashDealItemSchema = new Schema(
  {
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'FlashDealCampaign',
      required: true,
      index: true,
    },
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
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

flashDealItemSchema.index({ campaignId: 1, productId: 1 }, { unique: true });

export type FlashDealItem = InferSchemaType<typeof flashDealItemSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const FlashDealItemModel = model<FlashDealItem>('FlashDealItem', flashDealItemSchema);

/** Legacy flat deals — used only for one-time migration. */
const legacyFlashDealSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    discountType: {
      type: String,
      required: true,
      enum: FLASH_DEAL_DISCOUNT_TYPES,
    },
    discountValue: {
      type: Number,
      required: true,
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
    collection: 'flashdeals',
  },
);

export type LegacyFlashDeal = InferSchemaType<typeof legacyFlashDealSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const LegacyFlashDealModel = model<LegacyFlashDeal>(
  'LegacyFlashDeal',
  legacyFlashDealSchema,
);

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
