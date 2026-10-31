import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { SHIPMENT_STATUSES } from './constants';

const shipmentSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
    },
    orderNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 32,
    },
    status: {
      type: String,
      required: true,
      enum: SHIPMENT_STATUSES,
      default: 'awaiting_items',
    },
    carrier: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    trackingNumber: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    packedAt: { type: Date, default: null },
    shippedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

shipmentSchema.index({ status: 1, updatedAt: -1 });

export type Shipment = InferSchemaType<typeof shipmentSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ShipmentModel = model<Shipment>('Shipment', shipmentSchema);
