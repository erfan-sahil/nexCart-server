import { Types, type FilterQuery } from 'mongoose';
import { AppError } from '../../common/errors/AppError';
import { isDuplicateKeyError } from '../../common/errors/mongoError';
import { walletService } from '../wallet/wallet.service';
import { groupOrderItemsByStore } from '../fulfillment/fulfillment.mapper';
import { VendorFulfillmentModel } from '../fulfillment/vendor-fulfillment.model';
import { StoreModel } from '../stores/store.model';
import type { UserRole } from '../auth/types';
import { orderActivityService } from './order-activity.service';
import { OrderModel, type Order } from './order.model';
import { VendorOrderModel, type VendorOrder } from './vendor-order.model';
import { InboundBatchModel } from './inbound-batch.model';
import {
  buildSentLinesFromVendorOrder,
  createDispatchBatch,
  listBatchesForVendorOrder,
} from './inbound-batch.service';
import {
  assertResendAllowed,
  listRejectReturnsForVendorOrder,
  markAllInTransitReturnsReceivedByVendor,
} from './reject-return.service';
import { canVendorTransition } from './vendor-order-transitions';
import { restoreStockWithMovement } from './stock-movement.service';
import {
  toAdminOrderDetail,
  toAdminOrderListItem,
  toVendorOrderDto,
  toVendorOrderSummary,
} from './vendor-order.mapper';
import type {
  ListAdminOrdersQuery,
  ListVendorOrdersQuery,
  UpdateVendorOrderStatusBody,
} from './vendor-order.validator';
import { ShipmentModel } from '../fulfillment/shipment.model';
import { fulfillmentService } from '../fulfillment/fulfillment.service';
import { toVendorFulfillmentDto } from '../fulfillment/fulfillment.mapper';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const VENDOR_SORTS: Record<ListVendorOrdersQuery['sort'], Record<string, 1 | -1>> = {
  createdAt: { createdAt: 1, _id: 1 },
  '-createdAt': { createdAt: -1, _id: 1 },
  updatedAt: { updatedAt: 1, _id: 1 },
  '-updatedAt': { updatedAt: -1, _id: 1 },
};

const ADMIN_SORTS: Record<ListAdminOrdersQuery['sort'], Record<string, 1 | -1>> = {
  createdAt: { createdAt: 1, _id: 1 },
  '-createdAt': { createdAt: -1, _id: 1 },
};

const loadVendorOrderForVendor = async (vendorUserId: string, vendorOrderId: string) => {
  if (!Types.ObjectId.isValid(vendorOrderId)) {
    throw AppError.notFound('Vendor order not found');
  }

  const row = await VendorOrderModel.findOne({
    _id: vendorOrderId,
    vendorUserId: new Types.ObjectId(vendorUserId),
  });

  if (!row) {
    throw AppError.notFound('Vendor order not found');
  }

  return row;
};

const rollupParentFulfillment = async (parentOrderId: Types.ObjectId) => {
  const vendorOrders = await VendorOrderModel.find({ parentOrderId }).select('status');

  if (vendorOrders.length === 0) {
    return;
  }

  const allCancelled = vendorOrders.every((row) => row.status === 'cancelled');

  if (allCancelled) {
    await OrderModel.updateOne(
      { _id: parentOrderId, fulfillmentStatus: { $ne: 'cancelled' } },
      { $set: { fulfillmentStatus: 'cancelled', status: 'cancelled' } },
    );
    return;
  }

  const anyAcceptedOrLater = vendorOrders.some(
    (row) => row.status !== 'pending' && row.status !== 'cancelled',
  );

  if (anyAcceptedOrLater) {
    await OrderModel.updateOne(
      { _id: parentOrderId, fulfillmentStatus: 'confirmed' },
      { $set: { fulfillmentStatus: 'processing' } },
    );
  }
};

const canCancelParentOrder = async (orderId: Types.ObjectId) => {
  const sent = await InboundBatchModel.exists({ parentOrderId: orderId });

  return !sent;
};

export const vendorOrderService = {
  async createForConfirmedOrder(orderId: Types.ObjectId | string, actorUserId?: string) {
    const order = await OrderModel.findById(orderId);

    if (!order || order.status !== 'confirmed') {
      return;
    }

    await OrderModel.updateOne(
      { _id: order._id, fulfillmentStatus: { $in: ['placed', 'confirmed'] } },
      { $set: { fulfillmentStatus: 'confirmed' } },
    );

    const existing = await VendorOrderModel.findOne({ parentOrderId: order._id }).select('_id');

    if (existing) {
      return;
    }

    const storeIds = [...new Set(order.items.map((item) => String(item.storeId)))];
    const stores = await StoreModel.find({ _id: { $in: storeIds } }).select('_id name userId');
    const storeOwners = new Map(
      stores.map((store) => [
        String(store._id),
        { userId: String(store.userId), name: store.name },
      ]),
    );

    const groups = groupOrderItemsByStore(order, storeOwners);
    let index = 0;

    for (const group of groups) {
      index += 1;

      try {
        const created = await VendorOrderModel.create({
          parentOrderId: order._id,
          orderNumber: order.orderNumber,
          vendorOrderNumber: `${order.orderNumber}-S${index}`,
          storeId: new Types.ObjectId(group.storeId),
          storeName: group.storeName,
          vendorUserId: new Types.ObjectId(group.vendorUserId),
          status: 'pending',
          itemsSubtotal: money(group.itemsSubtotal),
          items: group.items.map((item) => ({
            variantId: item.variantId,
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            quantity: item.quantity,
            expectedQty: item.quantity,
            targetQty: item.quantity,
            acceptedQtyCumulative: 0,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
          })),
        });
        await walletService.applyCommissionSnapshot(created._id);
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }

    if (actorUserId) {
      await orderActivityService.log({
        parentOrderId: order._id,
        actorUserId,
        actorRole: 'admin',
        action: 'order_confirmed',
      });
    }
  },

  async listForVendor(vendorUserId: string, query: ListVendorOrdersQuery) {
    const filter: FilterQuery<VendorOrder> = {
      vendorUserId: new Types.ObjectId(vendorUserId),
    };

    if (query.status) {
      filter.status = query.status;
    }

    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      VendorOrderModel.find(filter).sort(VENDOR_SORTS[query.sort]).skip(skip).limit(query.limit),
      VendorOrderModel.countDocuments(filter),
    ]);

    return {
      items: rows.map(toVendorOrderDto),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async summaryForVendor(vendorUserId: string) {
    const rows = await VendorOrderModel.aggregate<{ _id: string; count: number }>([
      { $match: { vendorUserId: new Types.ObjectId(vendorUserId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const counts: Record<string, number> = { total: 0 };

    for (const row of rows) {
      counts[row._id] = row.count;
      counts.total = (counts.total ?? 0) + row.count;
    }

    return toVendorOrderSummary(counts);
  },

  async getForVendor(vendorUserId: string, vendorOrderId: string) {
    const row = await loadVendorOrderForVendor(vendorUserId, vendorOrderId);
    const [fulfillment, batches, rejectReturns] = await Promise.all([
      VendorFulfillmentModel.findOne({ vendorOrderId: row._id }),
      listBatchesForVendorOrder(row._id),
      listRejectReturnsForVendorOrder(row._id),
    ]);

    return {
      ...toVendorOrderDto(row),
      inbound: fulfillment ? toVendorFulfillmentDto(fulfillment) : null,
      inboundBatches: batches.map((batch) => ({
        id: String(batch._id),
        sequence: batch.sequence,
        status: batch.status,
        lines: batch.lines.map((line) => ({
          variantId: String(line.variantId),
          sku: line.sku,
          productName: line.productName,
          sentQty: line.sentQty,
          acceptedQty: line.acceptedQty,
          rejectedQty: line.rejectedQty,
          rejectionReason: line.rejectionReason,
          rejectionNote: line.rejectionNote,
        })),
        dispatchedAt: batch.dispatchedAt.toISOString(),
        receivedAt: batch.receivedAt?.toISOString() ?? null,
        inspectedAt: batch.inspectedAt?.toISOString() ?? null,
      })),
      rejectReturns: rejectReturns.map((ret) => ({
        id: String(ret._id),
        inboundBatchId: String(ret.inboundBatchId),
        status: ret.status,
        lines: ret.lines.map((line) => ({
          variantId: String(line.variantId),
          sku: line.sku,
          quantity: line.quantity,
          rejectionReason: line.rejectionReason,
          rejectionNote: line.rejectionNote,
        })),
        sentToVendorAt: ret.sentToVendorAt?.toISOString() ?? null,
        receivedByVendorAt: ret.receivedByVendorAt?.toISOString() ?? null,
      })),
    };
  },

  async transitionVendorOrder(
    vendorUserId: string,
    vendorOrderId: string,
    from: VendorOrder['status'],
    to: VendorOrder['status'],
    action: string,
    actorRole: UserRole = 'vendor',
  ) {
    const updated = await VendorOrderModel.findOneAndUpdate(
      {
        _id: vendorOrderId,
        vendorUserId: new Types.ObjectId(vendorUserId),
        status: from,
      },
      { $set: { status: to } },
      { new: true },
    );

    if (!updated) {
      throw AppError.validation(`Vendor order cannot move from ${from} to ${to}`);
    }

    await rollupParentFulfillment(updated.parentOrderId);

    await orderActivityService.log({
      parentOrderId: updated.parentOrderId,
      vendorOrderId: updated._id,
      actorUserId: vendorUserId,
      actorRole,
      action,
    });

    return toVendorOrderDto(updated);
  },

  async updateStatus(
    vendorUserId: string,
    vendorOrderId: string,
    input: UpdateVendorOrderStatusBody,
  ) {
    const row = await loadVendorOrderForVendor(vendorUserId, vendorOrderId);

    if (input.status === 'received_returned_rejects') {
      await markAllInTransitReturnsReceivedByVendor(row, vendorUserId);
      return this.getForVendor(vendorUserId, vendorOrderId);
    }

    if (!canVendorTransition(row.status, input.status)) {
      throw AppError.validation(`Vendor order cannot move from ${row.status} to ${input.status}`);
    }

    if (input.status === 'cancelled') {
      if (row.status !== 'pending') {
        throw AppError.validation('Vendor can only cancel while order is pending');
      }

      const updated = await this.transitionVendorOrder(
        vendorUserId,
        vendorOrderId,
        'pending',
        'cancelled',
        'vendor_order_cancelled',
      );

      for (const item of row.items) {
        await restoreStockWithMovement({
          orderId: row.parentOrderId,
          variantId: item.variantId,
          productId: item.productId,
          quantity: item.quantity,
          idempotencyKey: `order:${String(row.parentOrderId)}:vendor-cancel:${String(row._id)}:${item.sku}`,
          reason: 'vendor_order_cancelled',
        });
      }

      await walletService.reversePendingEarnings(row._id);

      return updated;
    }

    if (input.status === 'preparing') {
      if (row.status === 'partially_accepted' || row.status === 'rejected_at_warehouse') {
        await assertResendAllowed(row._id);
      }

      return this.transitionVendorOrder(
        vendorUserId,
        vendorOrderId,
        row.status,
        'preparing',
        'vendor_order_preparing',
      );
    }

    if (input.status === 'sending_to_warehouse') {
      const updated = await this.transitionVendorOrder(
        vendorUserId,
        vendorOrderId,
        'preparing',
        'sending_to_warehouse',
        'vendor_order_sending_to_warehouse',
      );

      const fresh = await loadVendorOrderForVendor(vendorUserId, vendorOrderId);
      const sentLines = buildSentLinesFromVendorOrder(fresh);
      await createDispatchBatch(fresh, sentLines);

      const fulfillment = await VendorFulfillmentModel.findOne({ vendorOrderId: fresh._id });

      if (fulfillment && fulfillment.status === 'pending') {
        fulfillment.status = 'dispatched';
        fulfillment.dispatchedAt = new Date();
        await fulfillment.save();
      }

      return updated;
    }

    return this.transitionVendorOrder(
      vendorUserId,
      vendorOrderId,
      row.status,
      input.status,
      `vendor_order_${input.status}`,
    );
  },

  async listForAdmin(query: ListAdminOrdersQuery) {
    const filter: FilterQuery<Order> = {
      status: { $nin: ['awaiting_payment', 'expired'] },
    };

    if (query.search) {
      filter.orderNumber = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    if (query.fulfillmentStatus) {
      filter.fulfillmentStatus = query.fulfillmentStatus;
    }

    if (query.paymentStatus) {
      filter.paymentStatus = query.paymentStatus;
    }

    const skip = (query.page - 1) * query.limit;

    const [orders, total] = await Promise.all([
      OrderModel.find(filter).sort(ADMIN_SORTS[query.sort]).skip(skip).limit(query.limit),
      OrderModel.countDocuments(filter),
    ]);

    const parentIds = orders.map((order) => order._id);
    const counts = await VendorOrderModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { parentOrderId: { $in: parentIds } } },
      { $group: { _id: '$parentOrderId', count: { $sum: 1 } } },
    ]);
    const countByParent = new Map(counts.map((row) => [String(row._id), row.count]));

    return {
      items: orders.map((order) => {
        const item = toAdminOrderListItem(order);
        item.vendorOrderCount = countByParent.get(String(order._id)) ?? 0;
        return item;
      }),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async getForAdmin(orderId: string) {
    if (!Types.ObjectId.isValid(orderId)) {
      throw AppError.notFound('Order not found');
    }

    const order = await OrderModel.findById(orderId);

    if (!order || order.status === 'awaiting_payment' || order.status === 'expired') {
      throw AppError.notFound('Order not found');
    }

    const [vendorOrders, activityRows, shipment] = await Promise.all([
      VendorOrderModel.find({ parentOrderId: order._id }).sort({ vendorOrderNumber: 1 }),
      orderActivityService.listForParent(orderId),
      ShipmentModel.findOne({ orderId: order._id }).select('status'),
    ]);

    const detail = toAdminOrderDetail(order, vendorOrders, activityRows, shipment?.status ?? null);
    detail.canCancel =
      order.status === 'confirmed' &&
      order.fulfillmentStatus !== 'cancelled' &&
      (await canCancelParentOrder(order._id));

    return detail;
  },

  async cancelByAdmin(adminUserId: string, orderId: string) {
    if (!Types.ObjectId.isValid(orderId)) {
      throw AppError.notFound('Order not found');
    }

    const order = await OrderModel.findById(orderId);

    if (!order) {
      throw AppError.notFound('Order not found');
    }

    if (!(await canCancelParentOrder(order._id))) {
      throw AppError.validation(
        'Order cannot be cancelled after inbound shipments have left the vendor',
      );
    }

    const cancelled = await OrderModel.findOneAndUpdate(
      {
        _id: order._id,
        status: 'confirmed',
        fulfillmentStatus: { $ne: 'cancelled' },
      },
      { $set: { status: 'cancelled', fulfillmentStatus: 'cancelled' } },
      { new: true },
    );

    if (!cancelled) {
      throw AppError.validation(
        'Only confirmed orders that have not started inbound shipping can be cancelled',
      );
    }

    await VendorOrderModel.updateMany(
      { parentOrderId: order._id, status: { $ne: 'cancelled' } },
      { $set: { status: 'cancelled' } },
    );

    const vendorOrders = await VendorOrderModel.find({ parentOrderId: order._id }).select('_id');

    for (const vo of vendorOrders) {
      await walletService.reversePendingEarnings(vo._id);
    }

    for (const reservation of cancelled.stockReservations) {
      await restoreStockWithMovement({
        orderId: cancelled._id,
        variantId: reservation.variantId,
        productId: reservation.productId,
        quantity: reservation.quantity,
        idempotencyKey: `order:${String(cancelled._id)}:cancel:${String(reservation.variantId)}`,
        reason: 'order_cancelled',
      });
    }

    await orderActivityService.log({
      parentOrderId: cancelled._id,
      actorUserId: adminUserId,
      actorRole: 'admin',
      action: 'order_cancelled',
    });

    return this.getForAdmin(orderId);
  },
};

export const confirmOrderPipeline = async (orderId: Types.ObjectId, actorUserId?: string) => {
  await vendorOrderService.createForConfirmedOrder(orderId, actorUserId);
  await fulfillmentService.bootstrapForOrder(orderId);
};
