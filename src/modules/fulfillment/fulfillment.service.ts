import { Types, type FilterQuery } from 'mongoose';
import { OrderModel, type Order } from '../orders/order.model';
import { ShipmentModel } from './shipment.model';
import { StoreModel } from '../stores/store.model';
import { VendorFulfillmentModel, type VendorFulfillment } from './vendor-fulfillment.model';
import { VendorOrderModel } from '../orders/vendor-order.model';
import { orderActivityService } from '../orders/order-activity.service';
import { rollupParentFulfillmentStatus } from '../orders/order-rollup.service';
import { catalogStatsService } from '../catalog/catalog-stats.service';
import { AppError } from '../../common/errors/AppError';
import { isDuplicateKeyError } from '../../common/errors/mongoError';
import type { FulfillmentRejectionReason } from './constants';
import type { ListVendorFulfillmentsQuery } from './fulfillment.validator';
import {
  groupOrderItemsByStore,
  toShipmentDto,
  toVendorFulfillmentDto,
} from './fulfillment.mapper';
import type { OrderFulfillmentSummaryDto, ShipmentDto, VendorFulfillmentDto } from './types';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const SORTS: Record<ListVendorFulfillmentsQuery['sort'], Record<string, 1 | -1>> = {
  createdAt: { createdAt: 1, _id: 1 },
  '-createdAt': { createdAt: -1, _id: 1 },
  updatedAt: { updatedAt: 1, _id: 1 },
  '-updatedAt': { updatedAt: -1, _id: 1 },
};

const loadFulfillment = async (fulfillmentId: string) => {
  if (!Types.ObjectId.isValid(fulfillmentId)) {
    throw AppError.notFound('Fulfillment not found');
  }

  const row = await VendorFulfillmentModel.findById(fulfillmentId);

  if (!row) {
    throw AppError.notFound('Fulfillment not found');
  }

  return row;
};

const assertVendorOwnsFulfillment = (row: VendorFulfillment, vendorUserId: string) => {
  if (String(row.vendorUserId) !== vendorUserId) {
    throw AppError.notFound('Fulfillment not found');
  }
};

const requireConfirmedOrder = async (orderId: string) => {
  if (!Types.ObjectId.isValid(orderId)) {
    throw AppError.notFound('Order not found');
  }

  const order = await OrderModel.findById(orderId);

  if (!order) {
    throw AppError.notFound('Order not found');
  }

  if (order.status === 'awaiting_payment' || order.status === 'expired') {
    throw AppError.validation('Order is not ready for fulfillment');
  }

  return order;
};

const allFulfillmentsReadyToPack = async (orderId: Types.ObjectId) => {
  const rows = await VendorFulfillmentModel.find({ orderId });

  if (rows.length === 0) {
    return false;
  }

  return rows.every((row) => row.status === 'accepted');
};

const recordOrderSales = async (order: Order) => {
  const marked = await OrderModel.findOneAndUpdate(
    { _id: order._id, saleRecordedAt: null },
    { $set: { saleRecordedAt: new Date() } },
    { new: true },
  );

  if (!marked) {
    return;
  }

  for (const item of marked.items) {
    await catalogStatsService.recordSale({
      productId: String(item.productId),
      units: item.quantity,
      amount: item.lineTotal,
    });
  }
};

export const fulfillmentService = {
  async bootstrapForOrder(orderId: Types.ObjectId | string) {
    const order = await OrderModel.findById(orderId);

    if (!order || order.status !== 'confirmed') {
      return;
    }

    const existingShipment = await ShipmentModel.findOne({ orderId: order._id }).select('_id');

    if (existingShipment) {
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

    try {
      await ShipmentModel.create({
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'pending',
      });

      for (const group of groups) {
        const vendorOrder = await VendorOrderModel.findOne({
          parentOrderId: order._id,
          storeId: new Types.ObjectId(group.storeId),
        }).select('_id');

        await VendorFulfillmentModel.create({
          orderId: order._id,
          orderNumber: order.orderNumber,
          storeId: new Types.ObjectId(group.storeId),
          storeName: group.storeName,
          vendorUserId: new Types.ObjectId(group.vendorUserId),
          vendorOrderId: vendorOrder?._id ?? null,
          status: 'pending',
          itemsSubtotal: money(group.itemsSubtotal),
          items: group.items.map((item) => ({
            variantId: item.variantId,
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            quantityOrdered: item.quantity,
            quantityReceived: 0,
            quantityAccepted: 0,
            quantityRejected: 0,
          })),
        });
      }
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  },

  async listForVendor(vendorUserId: string, query: ListVendorFulfillmentsQuery) {
    if (!Types.ObjectId.isValid(vendorUserId)) {
      throw AppError.unauthorized();
    }

    const filter: FilterQuery<VendorFulfillment> = {
      vendorUserId: new Types.ObjectId(vendorUserId),
    };

    if (query.status) {
      filter.status = query.status;
    }

    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      VendorFulfillmentModel.find(filter).sort(SORTS[query.sort]).skip(skip).limit(query.limit),
      VendorFulfillmentModel.countDocuments(filter),
    ]);

    return {
      items: rows.map(toVendorFulfillmentDto),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async getForVendor(vendorUserId: string, fulfillmentId: string): Promise<VendorFulfillmentDto> {
    const row = await loadFulfillment(fulfillmentId);
    assertVendorOwnsFulfillment(row, vendorUserId);

    return toVendorFulfillmentDto(row);
  },

  async listForAdmin(query: {
    page: number;
    limit: number;
    status?: VendorFulfillment['status'];
    orderNumber?: string;
  }) {
    const filter: FilterQuery<VendorFulfillment> = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.orderNumber) {
      filter.orderNumber = new RegExp(
        query.orderNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
    }

    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      VendorFulfillmentModel.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(query.limit),
      VendorFulfillmentModel.countDocuments(filter),
    ]);

    return {
      items: rows.map(toVendorFulfillmentDto),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async dispatch(
    vendorUserId: string,
    fulfillmentId: string,
    input: {
      inboundCarrier: string;
      inboundTracking: string;
    },
  ) {
    const row = await loadFulfillment(fulfillmentId);
    assertVendorOwnsFulfillment(row, vendorUserId);

    if (row.status !== 'pending') {
      throw AppError.validation('This fulfillment was already dispatched');
    }

    if (!row.vendorOrderId) {
      throw AppError.validation('Vendor order link is missing for this fulfillment');
    }

    const vendorOrder = await VendorOrderModel.findOneAndUpdate(
      {
        _id: row.vendorOrderId,
        vendorUserId: new Types.ObjectId(vendorUserId),
        status: 'ready_to_ship',
      },
      { $set: { status: 'in_transit' } },
      { new: true },
    );

    if (!vendorOrder) {
      throw AppError.validation('Mark the vendor order ready to ship before dispatching inbound');
    }

    const updated = await VendorFulfillmentModel.findOneAndUpdate(
      { _id: row._id, status: 'pending' },
      {
        $set: {
          status: 'dispatched',
          inboundCarrier: input.inboundCarrier,
          inboundTracking: input.inboundTracking,
          dispatchedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!updated) {
      throw AppError.validation('Inbound shipment could not be dispatched');
    }

    await orderActivityService.log({
      parentOrderId: row.orderId,
      vendorOrderId: row.vendorOrderId,
      actorUserId: vendorUserId,
      actorRole: 'vendor',
      action: 'inbound_dispatched',
    });

    return toVendorFulfillmentDto(updated);
  },

  async markInboundInTransit(vendorUserId: string, fulfillmentId: string) {
    const row = await loadFulfillment(fulfillmentId);
    assertVendorOwnsFulfillment(row, vendorUserId);

    const updated = await VendorFulfillmentModel.findOneAndUpdate(
      { _id: row._id, status: 'dispatched' },
      { $set: { status: 'in_transit' } },
      { new: true },
    );

    if (!updated) {
      throw AppError.validation('Inbound shipment must be dispatched first');
    }

    return toVendorFulfillmentDto(updated);
  },

  async receive(
    _adminId: string,
    fulfillmentId: string,
    input: {
      items: { variantId: string; quantity: number }[];
    },
  ) {
    const row = await loadFulfillment(fulfillmentId);

    if (row.status !== 'dispatched' && row.status !== 'in_transit') {
      throw AppError.validation('Fulfillment must be in transit before it can be received');
    }

    const quantities = new Map(input.items.map((item) => [item.variantId, item.quantity]));

    for (const line of row.items) {
      const variantId = String(line.variantId);
      const received = quantities.get(variantId);

      if (received === undefined) {
        throw AppError.validation('Received quantities must cover every line item');
      }

      if (received > line.quantityOrdered) {
        throw AppError.validation(
          `Received quantity for ${line.sku} cannot exceed ordered quantity`,
        );
      }

      line.quantityReceived = received;
    }

    row.status = 'received';
    row.receivedAt = new Date();
    row.markModified('items');
    await row.save();

    await orderActivityService.log({
      parentOrderId: row.orderId,
      vendorOrderId: row.vendorOrderId,
      actorUserId: _adminId,
      actorRole: 'admin',
      action: 'inbound_received',
    });

    return toVendorFulfillmentDto(row);
  },

  async startInspect(_adminId: string, fulfillmentId: string) {
    const updated = await VendorFulfillmentModel.findOneAndUpdate(
      { _id: fulfillmentId, status: 'received' },
      { $set: { status: 'inspecting' } },
      { new: true },
    );

    if (!updated) {
      throw AppError.validation('Fulfillment must be received before inspection starts');
    }

    return toVendorFulfillmentDto(updated);
  },

  async inspect(
    _adminId: string,
    fulfillmentId: string,
    input: {
      items: {
        variantId: string;
        quantityAccepted: number;
        quantityRejected: number;
        rejectionReason?: string;
        rejectionNote?: string;
      }[];
    },
  ) {
    const row = await loadFulfillment(fulfillmentId);

    if (row.status !== 'received' && row.status !== 'inspecting') {
      throw AppError.validation('Fulfillment must be received before inspection');
    }

    const byVariant = new Map(input.items.map((item) => [item.variantId, item]));
    let hasDiscrepancy = false;
    let allAccepted = true;
    let allRejected = true;

    for (const line of row.items) {
      const variantId = String(line.variantId);
      const inspected = byVariant.get(variantId);

      if (!inspected) {
        throw AppError.validation('Inspection must cover every line item');
      }

      const total = inspected.quantityAccepted + inspected.quantityRejected;

      if (total !== line.quantityReceived) {
        throw AppError.validation(
          `Accepted and rejected units for ${line.sku} must equal received quantity`,
        );
      }

      const shortfall = line.quantityOrdered - line.quantityReceived;
      const needsReason =
        inspected.quantityRejected > 0 ||
        shortfall > 0 ||
        inspected.quantityAccepted < line.quantityOrdered;

      if (needsReason && !inspected.rejectionReason) {
        throw AppError.validation(`Rejection reason is required for ${line.sku}`);
      }

      line.quantityAccepted = inspected.quantityAccepted;
      line.quantityRejected = inspected.quantityRejected;
      line.rejectionReason =
        (inspected.rejectionReason as FulfillmentRejectionReason | undefined) ?? null;
      line.rejectionNote = inspected.rejectionNote ?? '';

      if (inspected.quantityAccepted !== line.quantityOrdered) {
        hasDiscrepancy = true;
        allAccepted = false;
      }

      if (inspected.quantityAccepted > 0) {
        allRejected = false;
      }
    }

    let nextStatus: VendorFulfillment['status'] = 'accepted';
    let vendorOrderStatus: 'received' | 'partially_received' | 'exception' = 'received';

    if (allRejected) {
      nextStatus = 'rejected';
      vendorOrderStatus = 'exception';
    } else if (!allAccepted || hasDiscrepancy) {
      nextStatus = 'partially_accepted';
      vendorOrderStatus = 'partially_received';
    }

    row.status = nextStatus;
    row.hasDiscrepancy = hasDiscrepancy;
    row.inspectedAt = new Date();
    row.markModified('items');
    await row.save();

    if (row.vendorOrderId) {
      await VendorOrderModel.updateOne(
        { _id: row.vendorOrderId, status: 'in_transit' },
        { $set: { status: vendorOrderStatus } },
      );
    }

    await orderActivityService.log({
      parentOrderId: row.orderId,
      vendorOrderId: row.vendorOrderId,
      actorUserId: _adminId,
      actorRole: 'admin',
      action: 'inbound_inspected',
    });

    await rollupParentFulfillmentStatus(row.orderId);

    return toVendorFulfillmentDto(row);
  },

  async packShipment(_adminId: string, orderId: string): Promise<ShipmentDto> {
    await requireConfirmedOrder(orderId);

    const ready = await allFulfillmentsReadyToPack(new Types.ObjectId(orderId));

    if (!ready) {
      throw AppError.validation('Every vendor shipment must be fully accepted before packing');
    }

    const shipment = await ShipmentModel.findOne({ orderId });

    if (!shipment) {
      throw AppError.notFound('Shipment not found');
    }

    if (shipment.status !== 'pending' && shipment.status !== 'awaiting_items') {
      throw AppError.validation('Shipment is not ready to pack');
    }

    shipment.status = 'packed';
    shipment.packedAt = new Date();
    await shipment.save();

    await rollupParentFulfillmentStatus(orderId);

    return toShipmentDto(shipment);
  },

  async shipOrder(
    _adminId: string,
    orderId: string,
    input: { carrier: string; trackingNumber: string },
  ) {
    const order = await requireConfirmedOrder(orderId);

    const shipment = await ShipmentModel.findOne({ orderId: order._id });

    if (!shipment || (shipment.status !== 'packed' && shipment.status !== 'ready_to_pack')) {
      throw AppError.validation('Shipment must be packed before dispatch to the customer');
    }

    shipment.status = 'dispatched';
    shipment.carrier = input.carrier;
    shipment.trackingNumber = input.trackingNumber;
    shipment.shippedAt = new Date();
    await shipment.save();

    await rollupParentFulfillmentStatus(order._id);

    return {
      orderId: String(order._id),
      orderStatus: 'shipped',
      shipment: toShipmentDto(shipment),
    };
  },

  async advanceShipment(
    _adminId: string,
    orderId: string,
    nextStatus: 'in_transit' | 'out_for_delivery' | 'delivery_failed' | 'returned_to_warehouse',
  ) {
    const order = await requireConfirmedOrder(orderId);
    const shipment = await ShipmentModel.findOne({ orderId: order._id });

    if (!shipment) {
      throw AppError.notFound('Shipment not found');
    }

    const allowed: Record<string, string[]> = {
      dispatched: ['in_transit'],
      in_transit: ['out_for_delivery', 'delivery_failed'],
      out_for_delivery: ['delivered', 'delivery_failed', 'returned_to_warehouse'],
    };

    const options = allowed[shipment.status];

    if (!options?.includes(nextStatus)) {
      throw AppError.validation('Invalid shipment status transition');
    }

    shipment.status = nextStatus;
    await shipment.save();
    await rollupParentFulfillmentStatus(order._id);

    return { orderId: String(order._id), shipment: toShipmentDto(shipment) };
  },

  async deliverOrder(_adminId: string, orderId: string) {
    const order = await requireConfirmedOrder(orderId);
    const shipment = await ShipmentModel.findOne({ orderId: order._id });

    if (
      !shipment ||
      !['dispatched', 'in_transit', 'out_for_delivery', 'shipped'].includes(shipment.status)
    ) {
      throw AppError.validation('Shipment must be in transit before delivery');
    }

    shipment.status = 'delivered';
    shipment.deliveredAt = new Date();
    await shipment.save();

    if (order.paymentMethod === 'cod' && order.balanceDue > 0) {
      order.codCollectionStatus = 'pending';
    }

    await order.save();
    await rollupParentFulfillmentStatus(order._id);
    await recordOrderSales(order);

    const vendorOrders = await VendorOrderModel.find({
      parentOrderId: order._id,
      status: 'received',
    }).select('_id');

    if (vendorOrders.length > 0) {
      await VendorOrderModel.updateMany(
        { _id: { $in: vendorOrders.map((row) => row._id) } },
        { $set: { status: 'completed' } },
      );
    }

    const refreshed = await OrderModel.findById(order._id);

    return {
      orderId: String(order._id),
      orderStatus: refreshed?.status ?? order.status,
      codCollectionStatus: refreshed?.codCollectionStatus ?? order.codCollectionStatus,
      shipment: toShipmentDto(shipment),
    };
  },

  async recordCodCollection(
    _adminId: string,
    orderId: string,
    input: { amountCollected?: number; note?: string },
  ) {
    const order = await requireConfirmedOrder(orderId);

    if (order.paymentMethod !== 'cod') {
      throw AppError.validation('Cash collection applies only to cash-on-delivery orders');
    }

    if (order.status !== 'delivered') {
      throw AppError.validation('Collect cash only after the order is delivered');
    }

    if (order.codCollectionStatus === 'collected' || order.balanceDue <= 0) {
      throw AppError.validation('There is no outstanding balance to collect');
    }

    const expected = money(order.balanceDue);
    const collected = input.amountCollected === undefined ? expected : money(input.amountCollected);

    if (collected !== expected) {
      throw AppError.validation(
        `Collected amount must equal the outstanding balance (${expected})`,
      );
    }

    order.amountPaid = money(order.amountPaid + collected);
    order.balanceDue = 0;
    order.paymentStatus = 'paid';
    order.codCollectionStatus = 'collected';

    if (input.note) {
      order.note = order.note ? `${order.note}\n${input.note}` : input.note;
    }

    await order.save();

    return {
      orderId: String(order._id),
      amountPaid: order.amountPaid,
      balanceDue: order.balanceDue,
      paymentStatus: order.paymentStatus,
      codCollectionStatus: order.codCollectionStatus,
    };
  },

  async getOrderFulfillmentSummary(orderId: string): Promise<OrderFulfillmentSummaryDto> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw AppError.notFound('Order not found');
    }

    const [shipment, fulfillments] = await Promise.all([
      ShipmentModel.findOne({ orderId }),
      VendorFulfillmentModel.find({ orderId }).sort({ storeName: 1 }),
    ]);

    return {
      shipment: shipment ? toShipmentDto(shipment) : null,
      vendorFulfillments: fulfillments.map(toVendorFulfillmentDto),
    };
  },

  async getForAdmin(fulfillmentId: string) {
    const row = await loadFulfillment(fulfillmentId);

    return toVendorFulfillmentDto(row);
  },
};
