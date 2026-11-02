import { Types } from 'mongoose';
import { AppError } from '../../common/errors/AppError';
import {
  applyBatchInspection,
  getActiveBatch,
  markBatchInspecting,
  markBatchReceived,
  type InspectBatchLineInput,
} from './inbound-batch.service';
import { orderActivityService } from './order-activity.service';
import { RejectReturnModel } from './reject-return.model';
import { createRejectReturnFromBatch, markRejectReturnInTransit } from './reject-return.service';
import { moveReservedToWarehouseCustody } from './stock-movement.service';
import { toVendorOrderDto } from './vendor-order.mapper';
import { vendorOrderIsActiveForPack, vendorOrderLinesPackReady } from './vendor-order-transitions';
import { VendorOrderModel, type VendorOrder } from './vendor-order.model';
import { VendorFulfillmentModel } from '../fulfillment/vendor-fulfillment.model';
import { walletService } from '../wallet/wallet.service';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const loadVendorOrder = async (vendorOrderId: string) => {
  if (!Types.ObjectId.isValid(vendorOrderId)) {
    throw AppError.notFound('Vendor order not found');
  }

  const row = await VendorOrderModel.findById(vendorOrderId);

  if (!row) {
    throw AppError.notFound('Vendor order not found');
  }

  return row;
};

const deriveInspectVendorStatus = (
  vendorOrder: VendorOrder,
  batchAcceptedTotal: number,
  batchRejectedTotal: number,
) => {
  if (batchAcceptedTotal === 0 && batchRejectedTotal > 0) {
    return 'rejected_at_warehouse' as const;
  }

  const allTargetMet = vendorOrder.items.every(
    (line) => line.acceptedQtyCumulative === line.targetQty,
  );

  if (allTargetMet) {
    return 'accepted_at_warehouse' as const;
  }

  return 'partially_accepted' as const;
};

const syncVendorFulfillmentLegacy = async (vendorOrderId: Types.ObjectId, status: string) => {
  await VendorFulfillmentModel.updateOne({ vendorOrderId }, { $set: { status } }).catch(
    () => undefined,
  );
};

export const adminVendorOrderStatusService = {
  async updateStatus(
    adminUserId: string,
    vendorOrderId: string,
    input: {
      status: string;
      items?: InspectBatchLineInput[];
      adjustQuantities?: { variantId: string; targetQty: number }[];
      rejectReturnId?: string;
    },
  ) {
    const vendorOrder = await loadVendorOrder(vendorOrderId);

    if (input.adjustQuantities?.length || input.status === 'adjust_target_qty') {
      if (!input.adjustQuantities?.length) {
        throw AppError.validation('adjustQuantities is required');
      }

      for (const adj of input.adjustQuantities) {
        const line = vendorOrder.items.find((item) => String(item.variantId) === adj.variantId);

        if (!line) {
          throw AppError.validation(`Unknown variant ${adj.variantId}`);
        }

        if (adj.targetQty < line.acceptedQtyCumulative || adj.targetQty > line.expectedQty) {
          throw AppError.validation('targetQty must be between accepted cumulative and expected');
        }

        line.targetQty = adj.targetQty;
        line.quantity = adj.targetQty;
        line.lineTotal = money(line.unitPrice * adj.targetQty);
      }

      vendorOrder.itemsSubtotal = money(
        vendorOrder.items.reduce((sum, line) => sum + line.lineTotal, 0),
      );
      vendorOrder.markModified('items');

      if (vendorOrderLinesPackReady(vendorOrder)) {
        vendorOrder.status = 'accepted_at_warehouse';
      }

      await vendorOrder.save();
      await walletService.adjustPendingEarningsToSubtotal(
        vendorOrder._id,
        vendorOrder.itemsSubtotal,
      );

      await orderActivityService.log({
        parentOrderId: vendorOrder.parentOrderId,
        vendorOrderId: vendorOrder._id,
        actorUserId: adminUserId,
        actorRole: 'admin',
        action: 'vendor_order_target_qty_adjusted',
      });

      return toVendorOrderDto(vendorOrder);
    }

    if (input.status === 'received_at_warehouse') {
      if (vendorOrder.status !== 'sending_to_warehouse') {
        throw AppError.validation('Vendor order must be sending to warehouse before receive');
      }

      const batch = await getActiveBatch(vendorOrder._id);

      if (!batch || batch.status !== 'dispatched') {
        throw AppError.validation('No dispatched inbound batch to receive');
      }

      await markBatchReceived(batch);

      const updated = await VendorOrderModel.findOneAndUpdate(
        { _id: vendorOrder._id, status: 'sending_to_warehouse' },
        { $set: { status: 'received_at_warehouse' } },
        { new: true },
      );

      if (!updated) {
        throw AppError.validation('Vendor order could not be marked received');
      }

      await orderActivityService.log({
        parentOrderId: updated.parentOrderId,
        vendorOrderId: updated._id,
        actorUserId: adminUserId,
        actorRole: 'admin',
        action: 'vendor_order_received_at_warehouse',
      });

      return toVendorOrderDto(updated);
    }

    if (input.status === 'inspecting') {
      if (vendorOrder.status !== 'received_at_warehouse') {
        throw AppError.validation('Vendor order must be received before inspection');
      }

      const batch = await getActiveBatch(vendorOrder._id);

      if (!batch || batch.status !== 'received') {
        throw AppError.validation('Active batch must be received before inspection');
      }

      await markBatchInspecting(batch._id);

      const updated = await VendorOrderModel.findOneAndUpdate(
        { _id: vendorOrder._id, status: 'received_at_warehouse' },
        { $set: { status: 'inspecting' } },
        { new: true },
      );

      if (!updated) {
        throw AppError.validation('Vendor order could not start inspection');
      }

      return toVendorOrderDto(updated);
    }

    if (
      input.status === 'accepted_at_warehouse' ||
      input.status === 'partially_accepted' ||
      input.status === 'rejected_at_warehouse'
    ) {
      if (vendorOrder.status !== 'inspecting') {
        throw AppError.validation('Vendor order must be inspecting to submit product decision');
      }

      if (!input.items?.length) {
        throw AppError.validation('Inspection items are required');
      }

      const batch = await getActiveBatch(vendorOrder._id);

      if (!batch || (batch.status !== 'inspecting' && batch.status !== 'received')) {
        throw AppError.validation('No batch available for inspection');
      }

      if (batch.status === 'received') {
        await markBatchInspecting(batch._id);
      }

      const inspectedBatch = await applyBatchInspection(
        (await getActiveBatch(vendorOrder._id))!,
        input.items,
      );

      const freshVendorOrder = await VendorOrderModel.findById(vendorOrder._id);

      if (!freshVendorOrder) {
        throw AppError.notFound('Vendor order not found');
      }

      let batchAccepted = 0;
      let batchRejected = 0;

      for (const line of inspectedBatch.lines) {
        batchAccepted += line.acceptedQty;
        batchRejected += line.rejectedQty;

        if (line.acceptedQty > 0) {
          const voLine = freshVendorOrder.items.find(
            (item) => String(item.variantId) === String(line.variantId),
          );

          if (!voLine) {
            continue;
          }

          const nextCumulative = voLine.acceptedQtyCumulative + line.acceptedQty;

          if (nextCumulative > voLine.targetQty) {
            throw AppError.validation('Accepted quantity exceeds target for this line');
          }

          voLine.acceptedQtyCumulative = nextCumulative;

          await moveReservedToWarehouseCustody({
            orderId: freshVendorOrder.parentOrderId,
            variantId: line.variantId,
            productId: line.productId,
            quantity: line.acceptedQty,
            idempotencyKey: `batch:${String(inspectedBatch._id)}:${line.sku}:accept:${line.acceptedQty}`,
          });
        }
      }

      const nextStatus = deriveInspectVendorStatus(freshVendorOrder, batchAccepted, batchRejected);
      freshVendorOrder.status = nextStatus;
      freshVendorOrder.markModified('items');
      await freshVendorOrder.save();

      if (batchRejected > 0) {
        await createRejectReturnFromBatch(freshVendorOrder, inspectedBatch);
      }

      await orderActivityService.log({
        parentOrderId: freshVendorOrder.parentOrderId,
        vendorOrderId: freshVendorOrder._id,
        actorUserId: adminUserId,
        actorRole: 'admin',
        action: 'vendor_order_inspected',
        metadata: { status: nextStatus },
      });

      await syncVendorFulfillmentLegacy(
        freshVendorOrder._id,
        nextStatus === 'accepted_at_warehouse'
          ? 'accepted'
          : nextStatus === 'rejected_at_warehouse'
            ? 'rejected'
            : 'partially_accepted',
      );

      return toVendorOrderDto(freshVendorOrder);
    }

    if (input.status === 'return_rejects_to_vendor') {
      const rejectReturnId = input.rejectReturnId;

      if (!rejectReturnId || !Types.ObjectId.isValid(rejectReturnId)) {
        throw AppError.validation('rejectReturnId is required');
      }

      const row = await RejectReturnModel.findOne({
        _id: rejectReturnId,
        vendorOrderId: vendorOrder._id,
      });

      if (!row) {
        throw AppError.notFound('Reject return not found');
      }

      await markRejectReturnInTransit(row._id);

      await orderActivityService.log({
        parentOrderId: vendorOrder.parentOrderId,
        vendorOrderId: vendorOrder._id,
        actorUserId: adminUserId,
        actorRole: 'admin',
        action: 'reject_return_in_transit',
      });

      return toVendorOrderDto(vendorOrder);
    }

    if (input.status === 'cancelled') {
      const updated = await VendorOrderModel.findOneAndUpdate(
        { _id: vendorOrder._id, status: { $ne: 'cancelled' } },
        { $set: { status: 'cancelled' } },
        { new: true },
      );

      if (!updated) {
        throw AppError.validation('Vendor order cannot be cancelled');
      }

      await walletService.reversePendingEarnings(updated._id);

      await orderActivityService.log({
        parentOrderId: updated.parentOrderId,
        vendorOrderId: updated._id,
        actorUserId: adminUserId,
        actorRole: 'admin',
        action: 'vendor_order_cancelled',
      });

      return toVendorOrderDto(updated);
    }

    throw AppError.validation('Unsupported admin vendor order status');
  },

  async assertAllActiveVendorOrdersPackReady(parentOrderId: Types.ObjectId) {
    const rows = await VendorOrderModel.find({ parentOrderId });

    const active = rows.filter(vendorOrderIsActiveForPack);

    if (active.length === 0) {
      throw AppError.validation('No active vendor orders to pack');
    }

    for (const row of active) {
      if (!vendorOrderLinesPackReady(row)) {
        throw AppError.validation(
          'Every active vendor order must have accepted quantity equal to target before packing',
        );
      }
    }
  },
};
