import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

import {
  PRODUCT_REPORT_STATUSES,
  PRODUCT_REPORT_TYPES,
  REPORT_MESSAGE_MAX,
  REPORT_MESSAGE_MIN,
} from '../modules/product-reports/constants';

const productReportSchema = new Schema(
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
    reporterId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: PRODUCT_REPORT_TYPES,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: REPORT_MESSAGE_MIN,
      maxlength: REPORT_MESSAGE_MAX,
    },
    status: {
      type: String,
      required: true,
      enum: PRODUCT_REPORT_STATUSES,
      default: 'open',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

productReportSchema.index(
  { productId: 1, reporterId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } },
);
productReportSchema.index({ storeId: 1, createdAt: -1 });
productReportSchema.index({ status: 1, createdAt: -1 });

export type ProductReport = InferSchemaType<typeof productReportSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ProductReportModel = model<ProductReport>('ProductReport', productReportSchema);
