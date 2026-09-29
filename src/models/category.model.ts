import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { CATEGORY_LEVELS } from '../constants/category';

const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    image: {
      type: String,
      trim: true,
      default: '',
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    ancestors: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
      default: [],
    },
    level: {
      type: Number,
      required: true,
      enum: CATEGORY_LEVELS,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

categorySchema.index({ parentId: 1, sortOrder: 1, name: 1 });
categorySchema.index({ level: 1, isActive: 1, sortOrder: 1 });
categorySchema.index({ ancestors: 1 });

export type Category = InferSchemaType<typeof categorySchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const CategoryModel = model<Category>('Category', categorySchema);
