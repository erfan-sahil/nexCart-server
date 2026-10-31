import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { IMAGE_PROVIDERS, PRODUCT_APPROVAL_STATUSES, PRODUCT_STATUSES } from '../constants/product';

const productImageSchema = new Schema(
  {
    // Stable public id (img_…). Mongoose already uses `id`, so the field is imageId.
    imageId: {
      type: String,
      required: true,
    },
    provider: {
      type: String,
      required: true,
      enum: IMAGE_PROVIDERS,
    },
    storageKey: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
      min: 1,
    },
    alt: {
      type: String,
      trim: true,
      maxlength: 160,
      default: '',
    },
    sortOrder: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  { _id: false, id: false },
);

const productAttributeSchema = new Schema(
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
    boolean: {
      type: Boolean,
      default: null,
    },
    optionIds: {
      type: [{ type: Schema.Types.ObjectId }],
      default: [],
    },
  },
  { _id: false, id: false },
);

const ratingDistributionSchema = new Schema(
  {
    star1: { type: Number, required: true, default: 0, min: 0 },
    star2: { type: Number, required: true, default: 0, min: 0 },
    star3: { type: Number, required: true, default: 0, min: 0 },
    star4: { type: Number, required: true, default: 0, min: 0 },
    star5: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: false, id: false },
);

const ratingSummarySchema = new Schema(
  {
    average: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 5,
    },
    count: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    distribution: {
      type: ratingDistributionSchema,
      required: true,
      default: () => ({
        star1: 0,
        star2: 0,
        star3: 0,
        star4: 0,
        star5: 0,
      }),
    },
  },
  { _id: false, id: false },
);

const listingSchema = new Schema(
  {
    hasStock: {
      type: Boolean,
      required: true,
      default: false,
    },
    minPrice: {
      type: Number,
      default: null,
      min: 0,
    },
    minOriginalPrice: {
      type: Number,
      default: null,
      min: 0,
    },
    dealStartsAt: {
      type: Date,
      default: null,
    },
    dealEndsAt: {
      type: Date,
      default: null,
    },
    dealSavings: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { _id: false, id: false },
);

const metricsSchema = new Schema(
  {
    unitsSold30d: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    unitsSold7d: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    views7d: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    trendingScore: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { _id: false, id: false },
);

const productSchema = new Schema(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 160,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
    },
    shortDescription: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      maxlength: 10000,
      default: '',
    },
    images: {
      type: [productImageSchema],
      default: [],
    },
    thumbnailId: {
      type: String,
      trim: true,
      maxlength: 40,
      default: '',
    },
    attributes: {
      type: [productAttributeSchema],
      default: [],
    },
    tags: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 32 }],
      default: [],
    },
    status: {
      type: String,
      required: true,
      enum: PRODUCT_STATUSES,
      default: 'active',
    },
    approvalStatus: {
      type: String,
      required: true,
      enum: PRODUCT_APPROVAL_STATUSES,
      default: 'pending',
    },
    reviewNote: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    isFeatured: {
      type: Boolean,
      required: true,
      default: false,
    },
    isPublished: {
      type: Boolean,
      required: true,
      default: false,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    listing: {
      type: listingSchema,
      required: true,
      default: () => ({
        hasStock: false,
        minPrice: null,
        minOriginalPrice: null,
        dealStartsAt: null,
        dealEndsAt: null,
        dealSavings: 0,
      }),
    },
    metrics: {
      type: metricsSchema,
      required: true,
      default: () => ({
        unitsSold30d: 0,
        unitsSold7d: 0,
        views7d: 0,
        trendingScore: 0,
      }),
    },
    ratingSummary: {
      type: ratingSummarySchema,
      required: true,
      default: () => ({ average: 0, count: 0 }),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

productSchema.index({ storeId: 1, createdAt: -1 });
productSchema.index({ storeId: 1, approvalStatus: 1, createdAt: -1 });
productSchema.index({ approvalStatus: 1, status: 1, isPublished: 1, createdAt: -1 });
productSchema.index({ categoryId: 1, approvalStatus: 1, status: 1, isPublished: 1, createdAt: -1 });
productSchema.index({ approvalStatus: 1, status: 1, isPublished: 1, isFeatured: 1, createdAt: -1 });
productSchema.index({ tags: 1, approvalStatus: 1, status: 1, isPublished: 1 });
productSchema.index({
  approvalStatus: 1,
  status: 1,
  isPublished: 1,
  'listing.hasStock': 1,
  publishedAt: -1,
});
productSchema.index({
  approvalStatus: 1,
  status: 1,
  isPublished: 1,
  'listing.hasStock': 1,
  'metrics.unitsSold30d': -1,
});
productSchema.index({
  approvalStatus: 1,
  status: 1,
  isPublished: 1,
  'listing.hasStock': 1,
  'listing.dealEndsAt': 1,
});
productSchema.index({
  approvalStatus: 1,
  status: 1,
  isPublished: 1,
  'listing.hasStock': 1,
  'metrics.trendingScore': -1,
});
productSchema.index({
  categoryId: 1,
  approvalStatus: 1,
  status: 1,
  isPublished: 1,
  'listing.hasStock': 1,
});

export type Product = InferSchemaType<typeof productSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ProductModel = model<Product>('Product', productSchema);
