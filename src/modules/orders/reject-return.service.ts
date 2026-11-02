import type { Types } from 'mongoose';
import { AppError } from '../../common/errors/AppError';
import type { InboundBatch } from './inbound-batch.model';
import { RejectReturnModel } from './reject-return.model';
import { restoreStockWithMovement } from './stock-movement.service';
import type { VendorOrder } from './vendor-order.model';

export const hasOpenRejectReturns = async (vendorOrderId: Types.ObjectId) => {
  const open = await RejectReturnModel.findOne({
    vendorOrderId,
    status: { $in: ['pending_return', 'in_transit_to_vendor'] },
  }).select('_id');

  return Boolean(open);
};

export const assertResendAllowed = async (vendorOrderId: Types.ObjectId) => {
  const open = await RejectReturnModel.findOne({
    vendorOrderId,
    status: { $in: ['pending_return', 'in_transit_to_vendor'] },
  }).select('_id');

  if (open) {
    throw AppError.validation(
      'Rejected products must be returned and acknowledged before resending',
    );
  }
};

export const createRejectReturnFromBatch = async (
  vendorOrder: VendorOrder,
  batch: InboundBatch,
) => {
  const lines = batch.lines
    .filter((line) => line.rejectedQty > 0)
    .map((line) => ({
      variantId: line.variantId,
      productId: line.productId,
      sku: line.sku,
      quantity: line.rejectedQty,
      rejectionReason: line.rejectionReason!,
      rejectionNote: line.rejectionNote ?? '',
    }));

  if (lines.length === 0) {
    throw AppError.validation('No rejected quantity to return');
  }

  return RejectReturnModel.create({
    vendorOrderId: vendorOrder._id,
    inboundBatchId: batch._id,
    parentOrderId: vendorOrder.parentOrderId,
    status: 'pending_return',
    lines,
  });
};

export const markRejectReturnInTransit = async (rejectReturnId: Types.ObjectId) => {
  const updated = await RejectReturnModel.findOneAndUpdate(
    { _id: rejectReturnId, status: 'pending_return' },
    { $set: { status: 'in_transit_to_vendor', sentToVendorAt: new Date() } },
    { new: true },
  );

  if (!updated) {
    throw AppError.validation('Reject return is not pending');
  }

  return updated;
};

export const markAllInTransitReturnsReceivedByVendor = async (
  vendorOrder: VendorOrder,
  vendorUserId: string,
) => {
  if (String(vendorOrder.vendorUserId) !== vendorUserId) {
    throw AppError.notFound('Vendor order not found');
  }

  const rows = await RejectReturnModel.find({
    vendorOrderId: vendorOrder._id,
    status: 'in_transit_to_vendor',
  });

  if (rows.length === 0) {
    throw AppError.validation('No rejected products in transit to acknowledge');
  }

  for (const row of rows) {
    row.status = 'received_by_vendor';
    row.receivedByVendorAt = new Date();
    await row.save();

    for (const line of row.lines) {
      await restoreStockWithMovement({
        orderId: vendorOrder.parentOrderId,
        variantId: line.variantId,
        productId: line.productId,
        quantity: line.quantity,
        idempotencyKey: `reject-return:${String(row._id)}:${line.sku}:vendor-ack`,
        reason: 'reject_return_received_by_vendor',
      });
    }
  }

  return rows.length;
};

export const listRejectReturnsForVendorOrder = (vendorOrderId: Types.ObjectId) =>
  RejectReturnModel.find({ vendorOrderId }).sort({ createdAt: -1 });
