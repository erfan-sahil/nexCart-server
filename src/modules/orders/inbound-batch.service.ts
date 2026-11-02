import type { Types } from 'mongoose';
import { type HydratedDocument } from 'mongoose';
import { AppError } from '../../common/errors/AppError';
import { isDuplicateKeyError } from '../../common/errors/mongoError';
import type { FulfillmentRejectionReason } from '../fulfillment/constants';
import { InboundBatchModel, type InboundBatch } from './inbound-batch.model';
import type { VendorOrder } from './vendor-order.model';
import { outstandingQtyForLine } from './vendor-order-transitions';

export const nextBatchSequence = async (vendorOrderId: Types.ObjectId) => {
  const last = await InboundBatchModel.findOne({ vendorOrderId })
    .sort({ sequence: -1 })
    .select('sequence');

  return (last?.sequence ?? 0) + 1;
};

export const getActiveBatch = async (vendorOrderId: Types.ObjectId) => {
  return InboundBatchModel.findOne({
    vendorOrderId,
    status: { $in: ['dispatched', 'received', 'inspecting'] },
  }).sort({ sequence: -1 });
};

export const createDispatchBatch = async (
  vendorOrder: VendorOrder,
  sentLines: {
    variantId: Types.ObjectId;
    productId: Types.ObjectId;
    productName: string;
    sku: string;
    sentQty: number;
  }[],
) => {
  const sequence = await nextBatchSequence(vendorOrder._id);

  try {
    return await InboundBatchModel.create({
      vendorOrderId: vendorOrder._id,
      parentOrderId: vendorOrder.parentOrderId,
      sequence,
      status: 'dispatched',
      lines: sentLines,
      dispatchedAt: new Date(),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw AppError.conflict('An inbound batch is already in progress');
    }

    throw error;
  }
};

export const buildSentLinesFromVendorOrder = (vendorOrder: VendorOrder) => {
  const lines: {
    variantId: Types.ObjectId;
    productId: Types.ObjectId;
    productName: string;
    sku: string;
    sentQty: number;
  }[] = [];

  for (const line of vendorOrder.items) {
    const outstanding = outstandingQtyForLine(line);

    if (outstanding <= 0) {
      continue;
    }

    lines.push({
      variantId: line.variantId,
      productId: line.productId,
      productName: line.productName,
      sku: line.sku,
      sentQty: outstanding,
    });
  }

  if (lines.length === 0) {
    throw AppError.validation('No outstanding quantity to send to the warehouse');
  }

  return lines;
};

export const markBatchReceived = async (batch: InboundBatch) => {
  const updated = await InboundBatchModel.findOneAndUpdate(
    { _id: batch._id, status: 'dispatched' },
    { $set: { status: 'received', receivedAt: new Date() } },
    { new: true },
  );

  if (!updated) {
    throw AppError.validation('Inbound batch must be dispatched before it can be received');
  }

  return updated;
};

export const markBatchInspecting = async (batchId: Types.ObjectId) => {
  const updated = await InboundBatchModel.findOneAndUpdate(
    { _id: batchId, status: 'received' },
    { $set: { status: 'inspecting' } },
    { new: true },
  );

  if (!updated) {
    throw AppError.validation('Inbound batch must be received before inspection');
  }

  return updated;
};

export type InspectBatchLineInput = {
  variantId: string;
  acceptedQty: number;
  rejectedQty: number;
  rejectionReason?: FulfillmentRejectionReason;
  rejectionNote?: string;
};

type InboundBatchDocument = HydratedDocument<InboundBatch>;

export const applyBatchInspection = async (
  batch: InboundBatchDocument,
  items: InspectBatchLineInput[],
) => {
  const byVariant = new Map(items.map((item) => [item.variantId, item]));

  for (const line of batch.lines) {
    const variantId = String(line.variantId);
    const inspected = byVariant.get(variantId);

    if (!inspected) {
      throw AppError.validation('Inspection must cover every line in this batch');
    }

    const total = inspected.acceptedQty + inspected.rejectedQty;

    if (total !== line.sentQty) {
      throw AppError.validation(
        `Accepted and rejected units for ${line.sku} must equal sent quantity (${line.sentQty})`,
      );
    }

    if (inspected.rejectedQty > 0 && !inspected.rejectionReason) {
      throw AppError.validation(`Rejection reason is required for ${line.sku}`);
    }

    line.acceptedQty = inspected.acceptedQty;
    line.rejectedQty = inspected.rejectedQty;
    line.rejectionReason = inspected.rejectionReason ?? null;
    line.rejectionNote = inspected.rejectionNote ?? '';
  }

  batch.status = 'inspected';
  batch.inspectedAt = new Date();
  batch.markModified('lines');
  await batch.save();

  return batch;
};

export const listBatchesForVendorOrder = (vendorOrderId: Types.ObjectId | string) =>
  InboundBatchModel.find({ vendorOrderId }).sort({ sequence: 1 });
