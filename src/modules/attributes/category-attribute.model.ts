import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const categoryAttributeOptionSchema = new Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    value: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true },
);

const categoryAttributeSchema = new Schema(
  {
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    attributeId: {
      type: Schema.Types.ObjectId,
      ref: 'Attribute',
      required: true,
    },
    isRequired: {
      type: Boolean,
      default: false,
    },
    isFilterable: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
    options: {
      type: [categoryAttributeOptionSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

categoryAttributeSchema.index({ categoryId: 1, attributeId: 1 }, { unique: true });
categoryAttributeSchema.index({ categoryId: 1, sortOrder: 1 });
categoryAttributeSchema.index({ attributeId: 1 });

export type CategoryAttribute = InferSchemaType<typeof categoryAttributeSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const CategoryAttributeModel = model<CategoryAttribute>(
  'CategoryAttribute',
  categoryAttributeSchema,
);
