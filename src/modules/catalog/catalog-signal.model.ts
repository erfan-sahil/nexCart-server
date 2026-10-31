import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { CATALOG_SIGNAL_KINDS } from './constants';

const catalogSignalSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
    },
    kind: {
      type: String,
      required: true,
      enum: CATALOG_SIGNAL_KINDS,
    },
    units: {
      type: Number,
      required: true,
      min: 1,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    occurredAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

catalogSignalSchema.index({ productId: 1, kind: 1, occurredAt: -1 });

export type CatalogSignal = InferSchemaType<typeof catalogSignalSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const CatalogSignalModel = model<CatalogSignal>('CatalogSignal', catalogSignalSchema);
