import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const idempotencyRecordSchema = new Schema(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    scope: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    requestHash: {
      type: String,
      required: true,
      maxlength: 64,
    },
    status: {
      type: String,
      required: true,
      enum: ['processing', 'completed'],
    },
    responseStatusCode: {
      type: Number,
      min: 100,
      max: 599,
      default: null,
    },
    responseBody: {
      type: Schema.Types.Mixed,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

idempotencyRecordSchema.index({ customerId: 1, scope: 1, key: 1 }, { unique: true });
idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type IdempotencyRecord = InferSchemaType<typeof idempotencyRecordSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const IdempotencyRecordModel = model<IdempotencyRecord>(
  'IdempotencyRecord',
  idempotencyRecordSchema,
);
