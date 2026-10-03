import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const addressSchema = new Schema(
  {
    line1: { type: String, trim: true, maxlength: 160, default: '' },
    line2: { type: String, trim: true, maxlength: 160, default: '' },
    city: { type: String, trim: true, maxlength: 80, default: '' },
    state: { type: String, trim: true, maxlength: 80, default: '' },
    postalCode: { type: String, trim: true, maxlength: 20, default: '' },
    country: { type: String, trim: true, maxlength: 80, default: '' },
  },
  { _id: false },
);

const contactSchema = new Schema(
  {
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
  },
  { _id: false },
);

const storeSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
    },
    logo: { type: String, trim: true, maxlength: 2048, default: '' },
    banner: { type: String, trim: true, maxlength: 2048, default: '' },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    contact: { type: contactSchema, required: true },
    address: { type: addressSchema, required: true },
    categoryIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
      default: [],
    },
    ratingAverage: { type: Number, required: true, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, required: true, default: 0, min: 0 },
    totalProducts: { type: Number, required: true, default: 0, min: 0 },
    totalOrders: { type: Number, required: true, default: 0, min: 0 },
    totalSales: { type: Number, required: true, default: 0, min: 0 },
    returnPolicy: { type: String, trim: true, maxlength: 2000, default: '' },
    shippingPolicy: { type: String, trim: true, maxlength: 2000, default: '' },
    isActive: { type: Boolean, required: true, default: true },
    joinedAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

storeSchema.index({ isActive: 1, name: 1 });
storeSchema.index({ isActive: 1, joinedAt: -1 });
storeSchema.index({ isActive: 1, ratingAverage: -1 });
storeSchema.index({ categoryIds: 1, isActive: 1 });

export type Store = InferSchemaType<typeof storeSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const StoreModel = model<Store>('Store', storeSchema);
