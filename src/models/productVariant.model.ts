import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { VARIANT_STATUSES } from '../constants/variant';

const variantAttributeSchema = new Schema(
  {
    attributeId: {
      type: Schema.Types.ObjectId,
      ref: 'Attribute',
      required: true,
    },
    text: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    number: {
      type: Number,
      default: null,
    },
    optionIds: {
      type: [{ type: Schema.Types.ObjectId }],
      default: [],
    },
  },
  { _id: false, id: false },
);

const productVariantSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 40,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    compareAtPrice: {
      type: Number,
      default: null,
      min: 0,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    imageId: {
      type: String,
      trim: true,
      maxlength: 40,
      default: '',
    },
    attributes: {
      type: [variantAttributeSchema],
      default: [],
    },
    optionKey: {
      type: String,
      required: true,
      maxlength: 64,
    },
    status: {
      type: String,
      required: true,
      enum: VARIANT_STATUSES,
      default: 'active',
    },
    isDefault: {
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

productVariantSchema.index({ productId: 1, optionKey: 1 }, { unique: true });
productVariantSchema.index(
  { productId: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } },
);
productVariantSchema.index({ productId: 1, status: 1, price: 1 });
productVariantSchema.index({ productId: 1, createdAt: 1 });

export type ProductVariant = InferSchemaType<typeof productVariantSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ProductVariantModel = model<ProductVariant>('ProductVariant', productVariantSchema);
