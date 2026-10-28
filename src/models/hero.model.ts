import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { HERO_KEY, HERO_LIMITS } from '../constants/hero';

const heroSlideSchema = new Schema(
  {
    eyebrow: {
      type: String,
      required: [true, 'Eyebrow is required'],
      trim: true,
      minlength: [1, 'Eyebrow is required'],
      maxlength: [
        HERO_LIMITS.eyebrow,
        `Eyebrow must be ${HERO_LIMITS.eyebrow} characters or fewer`,
      ],
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [1, 'Title is required'],
      maxlength: [HERO_LIMITS.title, `Title must be ${HERO_LIMITS.title} characters or fewer`],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [1, 'Description is required'],
      maxlength: [
        HERO_LIMITS.description,
        `Description must be ${HERO_LIMITS.description} characters or fewer`,
      ],
    },
    image: {
      type: String,
      required: [true, 'Image is required'],
      trim: true,
      minlength: [1, 'Image is required'],
      maxlength: [HERO_LIMITS.image, `Image URL must be ${HERO_LIMITS.image} characters or fewer`],
    },
    isActive: {
      type: Boolean,
      required: [true, 'Active status is required'],
      default: true,
    },
  },
  { _id: false },
);

const heroSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: HERO_KEY,
    },
    slides: {
      type: [heroSlideSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type Hero = InferSchemaType<typeof heroSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const HeroModel = model<Hero>('Hero', heroSchema);
