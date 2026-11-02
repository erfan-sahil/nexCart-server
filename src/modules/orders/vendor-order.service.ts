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
import { restoreStockWithMovement } from './stock-movement.service';
import {
  toAdminOrderDetail,
  toAdminOrderListItem,
  toVendorOrderDto,
  toVendorOrderSummary,
} from './vendor-order.mapper';
import type { ListAdminOrdersQuery, ListVendorOrdersQuery } from './vendor-order.validator';
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
  const inbound = await VendorFulfillmentModel.find({ orderId }).select('status');

  if (inbound.length === 0) {
    return true;
  }

  return inbound.every((row) => row.status === 'pending');
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
    const fulfillment = await VendorFulfillmentModel.findOne({ vendorOrderId: row._id });
    return {
      ...toVendorOrderDto(row),
      inbound: fulfillment ? toVendorFulfillmentDto(fulfillment) : null,
    };
  },

  async dispatchInbound(
    vendorUserId: string,
    vendorOrderId: string,
    input: { inboundCarrier: string; inboundTracking: string },
  ) {
    const row = await loadVendorOrderForVendor(vendorUserId, vendorOrderId);
    const fulfillment = await VendorFulfillmentModel.findOne({ vendorOrderId: row._id });

    if (!fulfillment) {
      throw AppError.notFound('Inbound shipment not found');
    }

    return fulfillmentService.dispatch(vendorUserId, String(fulfillment._id), input);
  },

  async markInboundInTransit(vendorUserId: string, vendorOrderId: string) {
    const row = await loadVendorOrderForVendor(vendorUserId, vendorOrderId);
    const fulfillment = await VendorFulfillmentModel.findOne({ vendorOrderId: row._id });

    if (!fulfillment) {
      throw AppError.notFound('Inbound shipment not found');
    }

    return fulfillmentService.markInboundInTransit(vendorUserId, String(fulfillment._id));
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

  async accept(vendorUserId: string, vendorOrderId: string) {
    return this.transitionVendorOrder(
      vendorUserId,
      vendorOrderId,
      'pending',
      'accepted',
      'vendor_order_accepted',
    );
  },

  async prepare(vendorUserId: string, vendorOrderId: string) {
    return this.transitionVendorOrder(
      vendorUserId,
      vendorOrderId,
      'accepted',
      'preparing',
      'vendor_order_preparing',
    );
  },

  async markReady(vendorUserId: string, vendorOrderId: string) {
    return this.transitionVendorOrder(
      vendorUserId,
      vendorOrderId,
      'preparing',
      'ready_to_ship',
      'vendor_order_ready_to_ship',
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

    const [vendorOrders, activityRows] = await Promise.all([
      VendorOrderModel.find({ parentOrderId: order._id }).sort({ vendorOrderNumber: 1 }),
      orderActivityService.listForParent(orderId),
    ]);

    const detail = toAdminOrderDetail(order, vendorOrders, activityRows);
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
