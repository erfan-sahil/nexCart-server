import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { MAX_DELIVERY_FEE, MAX_FREE_DELIVERY_AMOUNT, SITE_SETTINGS_KEY } from './constants';

const siteSettingsSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: SITE_SETTINGS_KEY,
    },
    deliveryFee: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_DELIVERY_FEE,
    },
    freeDeliveryEnabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    freeDeliveryMinAmount: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_FREE_DELIVERY_AMOUNT,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type SiteSettings = InferSchemaType<typeof siteSettingsSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const SiteSettingsModel = model<SiteSettings>('SiteSettings', siteSettingsSchema);
