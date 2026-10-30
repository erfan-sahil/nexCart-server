import { Types, type FilterQuery } from 'mongoose';
import { OrderModel, type Order } from '../../models/order.model';
import { ShipmentModel } from '../../models/shipment.model';
import { StoreModel } from '../../models/store.model';
import {
  VendorFulfillmentModel,
  type VendorFulfillment,
} from '../../models/vendorFulfillment.model';
import { catalogStatsService } from '../../services/catalogStats.service';
import { AppError } from '../../utils/AppError';
import { isDuplicateKeyError } from '../../utils/mongoError';
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

  return rows.every((row) => row.status === 'inspected' && !row.hasDiscrepancy);
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
        status: 'awaiting_items',
      });

      for (const group of groups) {
        await VendorFulfillmentModel.create({
          orderId: order._id,
          orderNumber: order.orderNumber,
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

    row.status = 'dispatched';
    row.inboundCarrier = input.inboundCarrier;
    row.inboundTracking = input.inboundTracking;
    row.dispatchedAt = new Date();
    await row.save();

    return toVendorFulfillmentDto(row);
  },

  async receive(
    _adminId: string,
    fulfillmentId: string,
    input: {
      items: { variantId: string; quantity: number }[];
    },
  ) {
    const row = await loadFulfillment(fulfillmentId);

    if (row.status !== 'dispatched') {
      throw AppError.validation('Fulfillment must be dispatched before it can be received');
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

    return toVendorFulfillmentDto(row);
  },

  async inspect(
    _adminId: string,
    fulfillmentId: string,
    input: {
      items: { variantId: string; quantityAccepted: number; quantityRejected: number }[];
    },
  ) {
    const row = await loadFulfillment(fulfillmentId);

    if (row.status !== 'received') {
      throw AppError.validation('Fulfillment must be received before inspection');
    }

    const byVariant = new Map(input.items.map((item) => [item.variantId, item]));
    let hasDiscrepancy = false;

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

      line.quantityAccepted = inspected.quantityAccepted;
      line.quantityRejected = inspected.quantityRejected;

      if (inspected.quantityAccepted !== line.quantityOrdered || inspected.quantityRejected > 0) {
        hasDiscrepancy = true;
      }
    }

    row.status = 'inspected';
    row.hasDiscrepancy = hasDiscrepancy;
    row.inspectedAt = new Date();
    row.markModified('items');
    await row.save();

    return toVendorFulfillmentDto(row);
  },

  async packShipment(_adminId: string, orderId: string): Promise<ShipmentDto> {
    await requireConfirmedOrder(orderId);

    const ready = await allFulfillmentsReadyToPack(new Types.ObjectId(orderId));

    if (!ready) {
      throw AppError.validation(
        'Every vendor shipment must be inspected with no discrepancies before packing',
      );
    }

    const shipment = await ShipmentModel.findOne({ orderId });

    if (!shipment) {
      throw AppError.notFound('Shipment not found');
    }

    if (shipment.status !== 'awaiting_items') {
      throw AppError.validation('Shipment is not awaiting warehouse items');
    }

    shipment.status = 'ready_to_pack';
    shipment.packedAt = new Date();
    await shipment.save();

    return toShipmentDto(shipment);
  },

  async shipOrder(
    _adminId: string,
    orderId: string,
    input: { carrier: string; trackingNumber: string },
  ) {
    const order = await requireConfirmedOrder(orderId);

    if (order.status !== 'confirmed') {
      throw AppError.validation('Order must be confirmed before it can ship');
    }

    const shipment = await ShipmentModel.findOne({ orderId: order._id });

    if (!shipment || shipment.status !== 'ready_to_pack') {
      throw AppError.validation('Shipment must be packed before dispatch to the customer');
    }

    shipment.status = 'shipped';
    shipment.carrier = input.carrier;
    shipment.trackingNumber = input.trackingNumber;
    shipment.shippedAt = new Date();
    await shipment.save();

    order.status = 'shipped';
    await order.save();

    return {
      orderId: String(order._id),
      orderStatus: order.status,
      shipment: toShipmentDto(shipment),
    };
  },

  async deliverOrder(_adminId: string, orderId: string) {
    const order = await requireConfirmedOrder(orderId);

    if (order.status !== 'shipped') {
      throw AppError.validation('Order must be shipped before it can be marked delivered');
    }

    const shipment = await ShipmentModel.findOne({ orderId: order._id });

    if (!shipment || shipment.status !== 'shipped') {
      throw AppError.validation('Shipment must be in transit before delivery');
    }

    shipment.status = 'delivered';
    shipment.deliveredAt = new Date();
    await shipment.save();

    order.status = 'delivered';

    if (order.paymentMethod === 'cod' && order.balanceDue > 0) {
      order.codCollectionStatus = 'pending';
    }

    await order.save();
    await recordOrderSales(order);

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
