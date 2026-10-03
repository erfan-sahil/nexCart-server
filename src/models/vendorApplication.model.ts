import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import {
  VENDOR_APPLICATION_STATUSES,
  VENDOR_BUSINESS_TYPES,
  VENDOR_DOCUMENT_TYPES,
} from '../constants/vendorApplication';

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

const tradeLicenseSchema = new Schema(
  {
    number: { type: String, trim: true, maxlength: 64, default: '' },
    documentUrl: { type: String, trim: true, maxlength: 2048, default: '' },
  },
  { _id: false },
);

const taxSchema = new Schema(
  {
    taxId: { type: String, trim: true, maxlength: 64, default: '' },
    documentUrl: { type: String, trim: true, maxlength: 2048, default: '' },
  },
  { _id: false },
);

const statusEventSchema = new Schema(
  {
    status: {
      type: String,
      required: true,
      enum: VENDOR_APPLICATION_STATUSES,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { _id: false },
);

const personalSchema = new Schema(
  {
    fullName: { type: String, trim: true, maxlength: 120, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    dateOfBirth: { type: Date, default: null },
    address: { type: addressSchema, required: true, default: () => ({}) },
  },
  { _id: false },
);

const identitySchema = new Schema(
  {
    documentType: {
      type: String,
      enum: ['', ...VENDOR_DOCUMENT_TYPES],
      default: '',
    },
    documentNumber: { type: String, trim: true, uppercase: true, maxlength: 32, default: '' },
    documentImages: {
      type: [{ type: String, trim: true, maxlength: 2048 }],
      default: [],
    },
    selfieUrl: { type: String, trim: true, maxlength: 2048, default: '' },
  },
  { _id: false },
);

const businessSchema = new Schema(
  {
    storeName: { type: String, trim: true, maxlength: 120, default: '' },
    businessType: {
      type: String,
      enum: ['', ...VENDOR_BUSINESS_TYPES],
      default: '',
    },
    address: { type: addressSchema, required: true, default: () => ({}) },
    tradeLicense: { type: tradeLicenseSchema, required: true, default: () => ({}) },
    tax: { type: taxSchema, required: true, default: () => ({}) },
  },
  { _id: false },
);

const sellingSchema = new Schema(
  {
    categoryIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
      default: [],
    },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
  },
  { _id: false },
);

const vendorApplicationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    status: {
      type: String,
      required: true,
      enum: VENDOR_APPLICATION_STATUSES,
      default: 'draft',
    },
    personal: { type: personalSchema, required: true, default: () => ({}) },
    identity: { type: identitySchema, required: true, default: () => ({}) },
    business: { type: businessSchema, required: true, default: () => ({}) },
    selling: { type: sellingSchema, required: true, default: () => ({}) },
    reviewNote: { type: String, trim: true, maxlength: 1000, default: '' },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    statusHistory: { type: [statusEventSchema], default: [] },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

vendorApplicationSchema.index({ status: 1, updatedAt: -1 });
vendorApplicationSchema.index({ status: 1, submittedAt: -1 });
vendorApplicationSchema.index(
  { 'identity.documentType': 1, 'identity.documentNumber': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'identity.documentNumber': { $gt: '' },
    },
  },
);

export type VendorApplication = InferSchemaType<typeof vendorApplicationSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const VendorApplicationModel = model<VendorApplication>(
  'VendorApplication',
  vendorApplicationSchema,
);
