import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

export const VENDOR_RETURN_SHIPMENT_STATUSES = [
  'pending_dispatch_to_vendor',
  'in_transit_to_vendor',
  'received_by_vendor',
] as const;

const vendorReturnShipmentLineSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true, maxlength: 200 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const vendorReturnShipmentSchema = new Schema(
  {
    returnRequestId: {
      type: Schema.Types.ObjectId,
      ref: 'ReturnRequest',
      required: true,
    },
    vendorOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'VendorOrder',
      required: true,
    },
    parentOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
    },
    vendorUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: VENDOR_RETURN_SHIPMENT_STATUSES,
      default: 'pending_dispatch_to_vendor',
    },
    lines: { type: [vendorReturnShipmentLineSchema], required: true },
    carrier: { type: String, trim: true, maxlength: 80, default: '' },
    trackingNumber: { type: String, trim: true, maxlength: 120, default: '' },
    dispatchedAt: { type: Date, default: null },
    dispatchedByAdminId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    receivedByVendorAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

vendorReturnShipmentSchema.index({ returnRequestId: 1, vendorOrderId: 1 }, { unique: true });
vendorReturnShipmentSchema.index({ status: 1, createdAt: -1 });
vendorReturnShipmentSchema.index({ vendorUserId: 1, status: 1, createdAt: -1 });
vendorReturnShipmentSchema.index({ vendorOrderId: 1, createdAt: -1 });
vendorReturnShipmentSchema.index({ parentOrderId: 1, createdAt: -1 });
vendorReturnShipmentSchema.index({ storeId: 1, createdAt: -1 });

export type VendorReturnShipmentStatus = (typeof VENDOR_RETURN_SHIPMENT_STATUSES)[number];

export type VendorReturnShipment = InferSchemaType<typeof vendorReturnShipmentSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const VendorReturnShipmentModel = model<VendorReturnShipment>(
  'VendorReturnShipment',
  vendorReturnShipmentSchema,
);
