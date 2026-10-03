import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { USER_ROLES, USER_STATUSES } from '../constants/auth';

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 50,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 50,
    },
    phone: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      required: true,
      enum: USER_ROLES,
      default: 'customer',
    },
    status: {
      type: String,
      required: true,
      enum: USER_STATUSES,
      default: 'active',
    },
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
    avatarUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
    },
    failedLoginAttempts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      select: false,
    },
    lockUntil: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userSchema.index(
  { phone: 1 },
  {
    unique: true,
    partialFilterExpression: { phone: { $type: 'string' } },
  },
);
userSchema.index({ role: 1, status: 1 });

export type User = InferSchemaType<typeof userSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const UserModel = model<User>('User', userSchema);
