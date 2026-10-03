import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { ATTRIBUTE_ROLES, ATTRIBUTE_TYPES } from '../constants/attribute';

const attributeSchema = new Schema(
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
      maxlength: 500,
      default: '',
    },
    type: {
      type: String,
      required: true,
      enum: ATTRIBUTE_TYPES,
    },
    role: {
      type: String,
      required: true,
      enum: ATTRIBUTE_ROLES,
    },
    unit: {
      type: String,
      trim: true,
      maxlength: 16,
      default: '',
    },
    isFilterable: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

attributeSchema.index({ type: 1, role: 1, isActive: 1 });
attributeSchema.index({ name: 1 });

export type Attribute = InferSchemaType<typeof attributeSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const AttributeModel = model<Attribute>('Attribute', attributeSchema);
