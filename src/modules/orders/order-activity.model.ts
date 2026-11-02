import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { USER_ROLES } from '../auth/constants';

const orderActivitySchema = new Schema(
  {
    parentOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    vendorOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'VendorOrder',
      default: null,
    },
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actorRole: {
      type: String,
      required: true,
      enum: USER_ROLES,
    },
    action: { type: String, required: true, trim: true, maxlength: 80 },
    audience: {
      type: String,
      required: true,
      enum: ['internal'],
      default: 'internal',
    },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

orderActivitySchema.index({ parentOrderId: 1, createdAt: -1 });
orderActivitySchema.index({ vendorOrderId: 1, createdAt: -1 });

export type OrderActivity = InferSchemaType<typeof orderActivitySchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
};

export const OrderActivityModel = model<OrderActivity>('OrderActivity', orderActivitySchema);
