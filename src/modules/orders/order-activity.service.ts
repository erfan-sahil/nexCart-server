import { Types } from 'mongoose';
import type { UserRole } from '../auth/types';
import { OrderActivityModel } from './order-activity.model';

type LogActivityInput = {
  parentOrderId: Types.ObjectId | string;
  vendorOrderId?: Types.ObjectId | string | null;
  actorUserId: Types.ObjectId | string;
  actorRole: UserRole;
  action: string;
  metadata?: Record<string, unknown> | null;
};

export const orderActivityService = {
  async log(input: LogActivityInput) {
    await OrderActivityModel.create({
      parentOrderId: new Types.ObjectId(input.parentOrderId),
      vendorOrderId: input.vendorOrderId ? new Types.ObjectId(input.vendorOrderId) : null,
      actorUserId: new Types.ObjectId(input.actorUserId),
      actorRole: input.actorRole,
      action: input.action,
      audience: 'internal',
      metadata: input.metadata ?? null,
    });
  },

  async listForParent(parentOrderId: string) {
    if (!Types.ObjectId.isValid(parentOrderId)) {
      return [];
    }

    const rows = await OrderActivityModel.find({
      parentOrderId: new Types.ObjectId(parentOrderId),
    })
      .sort({ createdAt: 1 })
      .lean();

    return rows.map((row) => ({
      id: String(row._id),
      parentOrderId: String(row.parentOrderId),
      vendorOrderId: row.vendorOrderId ? String(row.vendorOrderId) : null,
      actorUserId: String(row.actorUserId),
      actorRole: row.actorRole,
      action: row.action,
      metadata: (row.metadata as Record<string, unknown> | null | undefined) ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  },
};
