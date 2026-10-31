import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const authSessionSchema = new Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    currentJti: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    lastUsedAt: {
      type: Date,
      required: true,
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 512,
      default: '',
    },
    ip: {
      type: String,
      trim: true,
      maxlength: 64,
      default: '',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

authSessionSchema.index({ userId: 1, revokedAt: 1 });
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AuthSession = InferSchemaType<typeof authSessionSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const AuthSessionModel = model<AuthSession>('AuthSession', authSessionSchema);
