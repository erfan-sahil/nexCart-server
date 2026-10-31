import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { SPONSORED_SECTIONS, SPONSORED_SLOTS } from './constants';

const sponsoredPlacementSchema = new Schema(
  {
    slot: {
      type: String,
      required: true,
      enum: SPONSORED_SLOTS,
      unique: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    section: {
      type: String,
      enum: SPONSORED_SECTIONS,
      default: null,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    subtitle: {
      type: String,
      trim: true,
      maxlength: 240,
      default: '',
    },
    ctaLabel: {
      type: String,
      trim: true,
      maxlength: 40,
      default: '',
    },
    image: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: '',
    },
    isActive: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type SponsoredPlacement = InferSchemaType<typeof sponsoredPlacementSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const SponsoredPlacementModel = model<SponsoredPlacement>(
  'SponsoredPlacement',
  sponsoredPlacementSchema,
);
