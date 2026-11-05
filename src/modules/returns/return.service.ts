import { Types } from 'mongoose';
import { AppError } from '../../common/errors/AppError';
import { isDuplicateKeyError } from '../../common/errors/mongoError';
import { ShipmentModel } from '../fulfillment/shipment.model';
import { OrderModel } from '../orders/order.model';
import { rollupParentFulfillmentStatus } from '../orders/order-rollup.service';
import { orderActivityService } from '../orders/order-activity.service';
import { restoreStockWithMovement } from '../orders/stock-movement.service';
import { VendorOrderModel, type VendorOrder } from '../orders/vendor-order.model';
import { walletService } from '../wallet/wallet.service';
import { RefundTransactionModel } from './refund-transaction.model';
import {
  ReturnRequestModel,
  type ReturnKind,
  type ReturnLineDisposition,
  type ReturnRequest,
} from './return-request.model';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

type RejectedLineInput = {
  variantId: string;
  quantity: number;
};

type ReturnLineInput = {
  vendorOrderId: Types.ObjectId;
  storeId: Types.ObjectId;
  vendorUserId: Types.ObjectId;
  variantId: Types.ObjectId;
  productId: Types.ObjectId;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  disposition: 'pending' | 'sellable' | 'damaged';
};

const toReturnDto = (row: ReturnRequest) => ({
  id: String(row._id),
  parentOrderId: String(row.parentOrderId),
  shipmentId: row.shipmentId ? String(row.shipmentId) : null,
  vendorOrderId: row.vendorOrderId ? String(row.vendorOrderId) : null,
  storeId: row.storeId ? String(row.storeId) : null,
  kind: row.kind,
  status: row.status,
  reason: row.reason,
  lines: row.lines.map((line) => ({
    vendorOrderId: String(line.vendorOrderId),
    storeId: String(line.storeId),
    vendorUserId: String(line.vendorUserId),
    variantId: String(line.variantId),
    productId: String(line.productId),
    productName: line.productName,
    sku: line.sku,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    disposition: line.disposition,
  })),
  merchandiseRefund: row.merchandiseRefund ?? 0,
  couponShare: row.couponShare ?? 0,
  deliveryFeeRefund: row.deliveryFeeRefund ?? 0,
  cashRefundAmount: row.cashRefundAmount ?? 0,
  balanceWaivedAmount: row.balanceWaivedAmount ?? 0,
  refundAmount: row.refundAmount,
  processedAt: row.processedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const buildLinesFromVendorOrders = (
  vendorOrders: VendorOrder[],
  selected?: RejectedLineInput[],
): ReturnLineInput[] => {
  const selectedMap = selected
    ? new Map(selected.map((line) => [line.variantId, line.quantity]))
    : null;

  const lines: ReturnLineInput[] = [];

  for (const vendorOrder of vendorOrders) {
    if (vendorOrder.status === 'cancelled') {
      continue;
    }

    for (const item of vendorOrder.items) {
      const variantId = String(item.variantId);
      const maxQty = item.targetQty ?? item.quantity;
      const quantity = selectedMap ? (selectedMap.get(variantId) ?? 0) : maxQty;

      if (quantity <= 0) {
        continue;
      }

      if (quantity > maxQty) {
        throw AppError.validation(`Rejected quantity exceeds ordered quantity for ${item.sku}`);
      }

      lines.push({
        vendorOrderId: vendorOrder._id,
        storeId: vendorOrder.storeId,
        vendorUserId: vendorOrder.vendorUserId,
        variantId: item.variantId,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        quantity,
        unitPrice: item.unitPrice,
        disposition: 'pending',
      });

      selectedMap?.delete(variantId);
    }
  }

  if (selectedMap && selectedMap.size > 0) {
    throw AppError.validation('One or more rejected variants do not belong to this order');
  }

  if (lines.length === 0) {
    throw AppError.validation('At least one rejected line is required');
  }

  return lines;
};

const computeRefundBreakdown = (
  order: {
    itemsSubtotal: number;
    couponDiscount: number;
    deliveryFee: number;
    paymentMethod: string;
    amountPaid: number;
    amountRefunded?: number | null;
    balanceDue: number;
  },
  lines: Array<{ unitPrice: number; quantity: number }>,
  allActiveMerchandiseRejected: boolean,
) => {
  const merchandiseGross = money(
    lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
  );
  const couponShare =
    order.itemsSubtotal > 0
      ? money((order.couponDiscount * merchandiseGross) / order.itemsSubtotal)
      : 0;
  const merchandiseNet = money(Math.max(0, merchandiseGross - couponShare));
  const deliveryFeeRefund = allActiveMerchandiseRejected ? money(order.deliveryFee) : 0;
  const grossRefund = money(merchandiseNet + deliveryFeeRefund);

  const alreadyRefunded = money(order.amountRefunded ?? 0);
  const cashAvailable = money(Math.max(0, order.amountPaid - alreadyRefunded));

  if (order.paymentMethod === 'prepaid') {
    const cashRefundAmount = money(Math.min(grossRefund, cashAvailable));
    return {
      merchandiseRefund: merchandiseGross,
      couponShare,
      deliveryFeeRefund,
      cashRefundAmount,
      balanceWaivedAmount: 0,
      refundAmount: grossRefund,
    };
  }

  // COD: merchandise lives in balanceDue until collected; delivery fee is typically prepaid online.
  const balanceWaivedAmount = money(Math.min(merchandiseNet, order.balanceDue));
  const cashRefundAmount = money(Math.min(deliveryFeeRefund, cashAvailable));

  return {
    merchandiseRefund: merchandiseGross,
    couponShare,
    deliveryFeeRefund,
    cashRefundAmount,
    balanceWaivedAmount,
    refundAmount: money(balanceWaivedAmount + cashRefundAmount),
  };
};

const activeMerchandiseTotal = (vendorOrders: VendorOrder[]) =>
  money(
    vendorOrders
      .filter((row) => row.status !== 'cancelled')
      .reduce(
        (sum, row) =>
          sum +
          row.items.reduce(
            (lineSum, item) => lineSum + item.unitPrice * (item.targetQty ?? item.quantity),
            0,
          ),
        0,
      ),
  );

const rejectedMerchandiseTotal = (lines: Array<{ unitPrice: number; quantity: number }>) =>
  money(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));

const syncVendorOrdersForReturn = async (
  vendorOrders: VendorOrder[],
  lines: ReturnLineInput[],
  kind: ReturnKind,
) => {
  const rejectedByVendor = new Map<string, Map<string, number>>();

  for (const line of lines) {
    const vendorKey = String(line.vendorOrderId);
    const variantKey = String(line.variantId);
    const byVariant = rejectedByVendor.get(vendorKey) ?? new Map<string, number>();
    byVariant.set(variantKey, (byVariant.get(variantKey) ?? 0) + line.quantity);
    rejectedByVendor.set(vendorKey, byVariant);
  }

  let anyAccepted = false;

  for (const vendorOrder of vendorOrders) {
    if (vendorOrder.status === 'cancelled') {
      continue;
    }

    const rejected = rejectedByVendor.get(String(vendorOrder._id));

    if (!rejected) {
      anyAccepted = true;
      await VendorOrderModel.updateOne({ _id: vendorOrder._id }, { $set: { status: 'delivered' } });
      continue;
    }

    let remainingSubtotal = 0;
    let rejectedAll = true;

    for (const item of vendorOrder.items) {
      const maxQty = item.targetQty ?? item.quantity;
      const rejectedQty = rejected.get(String(item.variantId)) ?? 0;
      const keptQty = maxQty - rejectedQty;

      if (keptQty > 0) {
        rejectedAll = false;
        remainingSubtotal = money(remainingSubtotal + item.unitPrice * keptQty);
      }
    }

    if (rejectedAll) {
      await VendorOrderModel.updateOne(
        { _id: vendorOrder._id },
        { $set: { status: kind === 'delivery_failed' ? 'delivery_failed' : 'customer_rejected' } },
      );
      await walletService.reversePendingEarnings(vendorOrder._id);
      continue;
    }

    anyAccepted = true;
    await VendorOrderModel.updateOne({ _id: vendorOrder._id }, { $set: { status: 'delivered' } });
    await walletService.adjustPendingEarningsToSubtotal(vendorOrder._id, remainingSubtotal);
  }

  return { anyAccepted };
};

const applyOrderPaymentRefund = async (
  orderId: Types.ObjectId,
  breakdown: {
    cashRefundAmount: number;
    balanceWaivedAmount: number;
  },
) => {
  const order = await OrderModel.findById(orderId);

  if (!order) {
    throw AppError.notFound('Order not found');
  }

  const nextAmountRefunded = money((order.amountRefunded ?? 0) + breakdown.cashRefundAmount);
  const nextBalanceDue = money(Math.max(0, order.balanceDue - breakdown.balanceWaivedAmount));
  const nextRefundable = money(Math.max(0, order.amountPaid - nextAmountRefunded));

  const update: Record<string, unknown> = {
    amountRefunded: nextAmountRefunded,
    balanceDue: nextBalanceDue,
    refundableAmount: nextRefundable,
  };

  if (order.paymentMethod === 'cod' && typeof order.codExpectedAmount === 'number') {
    update.codExpectedAmount = money(
      Math.max(0, order.codExpectedAmount - breakdown.balanceWaivedAmount),
    );
  }

  await OrderModel.updateOne({ _id: order._id }, { $set: update });
};

const restockSellableLines = async (row: ReturnRequest) => {
  for (const line of row.lines) {
    if (line.disposition !== 'sellable') {
      continue;
    }

    await restoreStockWithMovement({
      orderId: row.parentOrderId,
      variantId: line.variantId,
      productId: line.productId,
      quantity: line.quantity,
      reason: 'delivery_return_restock',
      idempotencyKey: `return:${String(row._id)}:line:${String(line.variantId)}:restock`,
    });
  }
};

const processAcceptedRefund = async (adminId: string, returnId: string) => {
  const claimed = await ReturnRequestModel.findOneAndUpdate(
    { _id: returnId, status: 'accepted' },
    { $set: { status: 'refund_processing' } },
    { new: true },
  );

  if (!claimed) {
    const existing = await ReturnRequestModel.findById(returnId);
    if (existing?.status === 'refunded' || existing?.status === 'refund_processing') {
      return toReturnDto(existing);
    }
    throw AppError.validation('Return is not ready for refund processing');
  }

  const order = await OrderModel.findById(claimed.parentOrderId);

  if (!order) {
    throw AppError.notFound('Order not found');
  }

  await restockSellableLines(claimed);

  const vendorOrders = await VendorOrderModel.find({ parentOrderId: order._id });
  const rejectedGross = rejectedMerchandiseTotal(claimed.lines);
  const activeGross = activeMerchandiseTotal(vendorOrders);
  const allRejected = rejectedGross >= activeGross - 0.001;

  const breakdown = computeRefundBreakdown(
    {
      itemsSubtotal: order.itemsSubtotal,
      couponDiscount: order.couponDiscount ?? 0,
      deliveryFee: order.deliveryFee,
      paymentMethod: order.paymentMethod,
      amountPaid: order.amountPaid,
      amountRefunded: order.amountRefunded ?? 0,
      balanceDue: order.balanceDue,
    },
    claimed.lines,
    allRejected,
  );

  claimed.merchandiseRefund = breakdown.merchandiseRefund;
  claimed.couponShare = breakdown.couponShare;
  claimed.deliveryFeeRefund = breakdown.deliveryFeeRefund;
  claimed.cashRefundAmount = breakdown.cashRefundAmount;
  claimed.balanceWaivedAmount = breakdown.balanceWaivedAmount;
  claimed.refundAmount = breakdown.refundAmount;
  await claimed.save();

  await applyOrderPaymentRefund(order._id, breakdown);

  const refundStatus =
    breakdown.cashRefundAmount > 0
      ? order.paymentMethod === 'prepaid'
        ? 'payout_pending'
        : 'recorded'
      : breakdown.balanceWaivedAmount > 0
        ? 'waived_only'
        : 'recorded';

  try {
    await RefundTransactionModel.create({
      parentOrderId: order._id,
      returnId: claimed._id,
      paymentMethod: order.paymentMethod,
      merchandiseRefund: breakdown.merchandiseRefund,
      couponShare: breakdown.couponShare,
      deliveryFeeRefund: breakdown.deliveryFeeRefund,
      cashRefundAmount: breakdown.cashRefundAmount,
      balanceWaivedAmount: breakdown.balanceWaivedAmount,
      currency: order.currency,
      status: refundStatus,
      createdByAdminId: new Types.ObjectId(adminId),
      note: `Return ${String(claimed._id)}`,
      idempotencyKey: `return:${String(claimed._id)}:customer`,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  // Vendor wallet was already adjusted when the return opened (pending reverse / partial adjust).
  // If a slice somehow released early, debit available for the rejected share once.
  for (const vendorOrder of vendorOrders) {
    const vendorLines = claimed.lines.filter(
      (line) => String(line.vendorOrderId) === String(vendorOrder._id),
    );

    if (vendorLines.length === 0) {
      continue;
    }

    const merchandise = money(
      vendorLines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    );

    if (merchandise <= 0 || typeof vendorOrder.commissionRate !== 'number') {
      continue;
    }

    await walletService.reverseRejectedEarningsIfReleased({
      vendorOrderId: vendorOrder._id,
      returnId: claimed._id,
      merchandiseRefund: merchandise,
      adminId,
    });
  }

  claimed.status = 'refunded';
  claimed.processedAt = new Date();
  claimed.resolvedByAdminId = new Types.ObjectId(adminId);
  await claimed.save();

  const fulfillmentStatus = allRejected ? 'returned' : 'partially_returned';
  await OrderModel.updateOne(
    { _id: order._id },
    {
      $set: {
        fulfillmentStatus,
        ...(allRejected ? {} : { status: 'delivered' }),
      },
    },
  );

  await rollupParentFulfillmentStatus(order._id);

  await orderActivityService.log({
    parentOrderId: order._id,
    actorUserId: adminId,
    actorRole: 'admin',
    action: 'return_refunded',
    metadata: {
      returnId: String(claimed._id),
      cashRefundAmount: breakdown.cashRefundAmount,
      balanceWaivedAmount: breakdown.balanceWaivedAmount,
    },
  });

  return toReturnDto(claimed);
};

export const returnService = {
  async listForVendor(vendorUserId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const vendorObjectId = new Types.ObjectId(vendorUserId);
    const filter = {
      $or: [{ vendorUserId: vendorObjectId }, { 'lines.vendorUserId': vendorObjectId }],
    };

    const [rows, total] = await Promise.all([
      ReturnRequestModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ReturnRequestModel.countDocuments(filter),
    ]);

    return {
      items: rows.map(toReturnDto),
      page,
      limit,
      total,
    };
  },

  async listForAdmin(
    page: number,
    limit: number,
    filters?: { status?: string; kind?: string; parentOrderId?: string },
  ) {
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};

    if (filters?.status) {
      filter.status = filters.status;
    }

    if (filters?.kind) {
      filter.kind = filters.kind;
    }

    if (filters?.parentOrderId && Types.ObjectId.isValid(filters.parentOrderId)) {
      filter.parentOrderId = new Types.ObjectId(filters.parentOrderId);
    }

    const [rows, total] = await Promise.all([
      ReturnRequestModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ReturnRequestModel.countDocuments(filter),
    ]);

    return {
      items: rows.map(toReturnDto),
      page,
      limit,
      total,
    };
  },

  async getById(returnId: string) {
    if (!Types.ObjectId.isValid(returnId)) {
      throw AppError.notFound('Return request not found');
    }

    const row = await ReturnRequestModel.findById(returnId);

    if (!row) {
      throw AppError.notFound('Return request not found');
    }

    return toReturnDto(row);
  },

  async listForOrder(parentOrderId: string) {
    if (!Types.ObjectId.isValid(parentOrderId)) {
      return [];
    }

    const rows = await ReturnRequestModel.find({
      parentOrderId: new Types.ObjectId(parentOrderId),
    }).sort({ createdAt: -1 });

    return rows.map(toReturnDto);
  },

  async findActiveForOrder(parentOrderId: Types.ObjectId | string) {
    return ReturnRequestModel.findOne({
      parentOrderId: new Types.ObjectId(parentOrderId),
      status: {
        $in: [
          'pending_warehouse_receipt',
          'received_at_warehouse',
          'accepted',
          'refund_processing',
          'damaged',
          'inspection_rejected',
        ],
      },
    });
  },

  async openFromShipment(
    adminId: string,
    orderId: string,
    input: {
      kind: ReturnKind;
      reason: string;
      lines?: RejectedLineInput[];
    },
  ) {
    if (!Types.ObjectId.isValid(orderId)) {
      throw AppError.notFound('Order not found');
    }

    const orderObjectId = new Types.ObjectId(orderId);
    const order = await OrderModel.findById(orderObjectId);

    if (!order) {
      throw AppError.notFound('Order not found');
    }

    const shipment = await ShipmentModel.findOne({ orderId: orderObjectId });

    if (!shipment) {
      throw AppError.notFound('Shipment not found');
    }

    if (shipment.status === 'delivered') {
      throw AppError.validation('Returns are not allowed after successful delivery acceptance');
    }

    if (!['out_for_delivery', 'in_transit', 'dispatched'].includes(shipment.status)) {
      throw AppError.validation('Shipment must be out for delivery to record a delivery failure');
    }

    const existing = await ReturnRequestModel.findOne({ shipmentId: shipment._id });

    if (existing) {
      throw AppError.conflict('A return already exists for this shipment');
    }

    if (input.kind === 'customer_rejected' && (!input.lines || input.lines.length === 0)) {
      throw AppError.validation('Rejected lines are required for customer rejection');
    }

    const vendorOrders = await VendorOrderModel.find({ parentOrderId: orderObjectId });
    const lines = buildLinesFromVendorOrders(
      vendorOrders,
      input.kind === 'delivery_failed' ? undefined : input.lines,
    );

    const nextShipmentStatus =
      input.kind === 'delivery_failed' ? 'delivery_failed' : 'customer_rejected';

    shipment.status = nextShipmentStatus;
    await shipment.save();

    const { anyAccepted } = await syncVendorOrdersForReturn(vendorOrders, lines, input.kind);

    if (anyAccepted && !shipment.deliveredAt) {
      shipment.deliveredAt = new Date();
      await shipment.save();
    }

    let row: ReturnRequest;

    try {
      row = await ReturnRequestModel.create({
        parentOrderId: orderObjectId,
        shipmentId: shipment._id,
        kind: input.kind,
        reason: input.reason.trim(),
        status: 'pending_warehouse_receipt',
        lines,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw AppError.conflict('A return already exists for this shipment');
      }
      throw error;
    }

    await OrderModel.updateOne(
      { _id: orderObjectId },
      {
        $set: {
          fulfillmentStatus: anyAccepted ? 'partially_returned' : 'returned',
        },
      },
    );

    await orderActivityService.log({
      parentOrderId: orderObjectId,
      actorUserId: adminId,
      actorRole: 'admin',
      action: input.kind === 'delivery_failed' ? 'delivery_failed' : 'customer_rejected',
      metadata: {
        returnId: String(row._id),
        lineCount: lines.length,
      },
    });

    await rollupParentFulfillmentStatus(orderObjectId);

    return {
      orderId,
      shipment: {
        status: shipment.status,
        deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
      },
      return: toReturnDto(row),
    };
  },

  async markReturning(adminId: string, returnId: string) {
    const row = await ReturnRequestModel.findById(returnId);

    if (!row) {
      throw AppError.notFound('Return request not found');
    }

    if (row.status !== 'pending_warehouse_receipt') {
      throw AppError.validation('Return is not awaiting warehouse return transit');
    }

    if (!row.shipmentId) {
      throw AppError.validation('Return is not linked to a shipment');
    }

    const shipment = await ShipmentModel.findById(row.shipmentId);

    if (!shipment) {
      throw AppError.notFound('Shipment not found');
    }

    if (!['delivery_failed', 'customer_rejected'].includes(shipment.status)) {
      throw AppError.validation('Shipment is not in a failed/rejected state');
    }

    shipment.status = 'returning_to_warehouse';
    await shipment.save();

    await orderActivityService.log({
      parentOrderId: row.parentOrderId,
      actorUserId: adminId,
      actorRole: 'admin',
      action: 'returning_to_warehouse',
      metadata: { returnId: String(row._id) },
    });

    await rollupParentFulfillmentStatus(row.parentOrderId);

    return {
      return: toReturnDto(row),
      shipmentStatus: shipment.status,
    };
  },

  async markReceived(adminId: string, returnId: string) {
    const row = await ReturnRequestModel.findOneAndUpdate(
      {
        _id: returnId,
        status: 'pending_warehouse_receipt',
      },
      { $set: { status: 'received_at_warehouse' } },
      { new: true },
    );

    if (!row) {
      throw AppError.validation('Return is not awaiting warehouse receipt');
    }

    if (row.shipmentId) {
      await ShipmentModel.updateOne(
        {
          _id: row.shipmentId,
          status: { $in: ['delivery_failed', 'customer_rejected', 'returning_to_warehouse'] },
        },
        { $set: { status: 'returned_to_warehouse' } },
      );
    }

    await orderActivityService.log({
      parentOrderId: row.parentOrderId,
      actorUserId: adminId,
      actorRole: 'admin',
      action: 'return_received_at_warehouse',
      metadata: { returnId: String(row._id) },
    });

    await rollupParentFulfillmentStatus(row.parentOrderId);

    return toReturnDto(row);
  },

  async inspect(
    adminId: string,
    returnId: string,
    input: {
      lines: Array<{ variantId: string; disposition: Exclude<ReturnLineDisposition, 'pending'> }>;
    },
  ) {
    const row = await ReturnRequestModel.findById(returnId);

    if (!row) {
      throw AppError.notFound('Return request not found');
    }

    if (row.status !== 'received_at_warehouse') {
      throw AppError.validation('Return must be received at warehouse before inspection');
    }

    const dispositionMap = new Map(
      input.lines.map((line) => [line.variantId, line.disposition] as const),
    );

    for (const line of row.lines) {
      const disposition = dispositionMap.get(String(line.variantId));

      if (!disposition) {
        throw AppError.validation(`Missing disposition for variant ${String(line.variantId)}`);
      }

      line.disposition = disposition;
    }

    const hasDamaged = row.lines.some((line) => line.disposition === 'damaged');
    const allSellable = row.lines.every((line) => line.disposition === 'sellable');

    if (!allSellable && hasDamaged) {
      row.status = 'damaged';
      await row.save();

      await orderActivityService.log({
        parentOrderId: row.parentOrderId,
        actorUserId: adminId,
        actorRole: 'admin',
        action: 'return_inspection_damaged',
        metadata: { returnId: String(row._id) },
      });

      return toReturnDto(row);
    }

    if (!allSellable) {
      row.status = 'inspection_rejected';
      await row.save();

      await orderActivityService.log({
        parentOrderId: row.parentOrderId,
        actorUserId: adminId,
        actorRole: 'admin',
        action: 'return_inspection_rejected',
        metadata: { returnId: String(row._id) },
      });

      return toReturnDto(row);
    }

    row.status = 'accepted';
    await row.save();

    await orderActivityService.log({
      parentOrderId: row.parentOrderId,
      actorUserId: adminId,
      actorRole: 'admin',
      action: 'return_accepted',
      metadata: { returnId: String(row._id) },
    });

    return processAcceptedRefund(adminId, String(row._id));
  },

  async resolveManually(
    adminId: string,
    returnId: string,
    input: {
      action: 'refund_without_restock' | 'close_without_refund';
      note?: string;
    },
  ) {
    const row = await ReturnRequestModel.findById(returnId);

    if (!row) {
      throw AppError.notFound('Return request not found');
    }

    if (!['damaged', 'inspection_rejected'].includes(row.status)) {
      throw AppError.validation('Manual resolution is only available for exception returns');
    }

    row.resolutionNote = input.note?.trim() ?? '';
    row.resolvedByAdminId = new Types.ObjectId(adminId);

    if (input.action === 'close_without_refund') {
      row.status = 'closed_without_refund';
      row.processedAt = new Date();
      await row.save();

      await orderActivityService.log({
        parentOrderId: row.parentOrderId,
        actorUserId: adminId,
        actorRole: 'admin',
        action: 'return_closed_without_refund',
        metadata: { returnId: String(row._id) },
      });

      return toReturnDto(row);
    }

    for (const line of row.lines) {
      if (line.disposition === 'pending') {
        line.disposition = 'damaged';
      }
    }

    row.status = 'accepted';
    await row.save();

    return processAcceptedRefund(adminId, String(row._id));
  },

  async previewRefund(returnId: string) {
    const row = await ReturnRequestModel.findById(returnId);

    if (!row) {
      throw AppError.notFound('Return request not found');
    }

    const order = await OrderModel.findById(row.parentOrderId);

    if (!order) {
      throw AppError.notFound('Order not found');
    }

    const vendorOrders = await VendorOrderModel.find({ parentOrderId: order._id });
    const rejectedGross = rejectedMerchandiseTotal(row.lines);
    const activeGross = activeMerchandiseTotal(vendorOrders);

    return computeRefundBreakdown(
      {
        itemsSubtotal: order.itemsSubtotal,
        couponDiscount: order.couponDiscount ?? 0,
        deliveryFee: order.deliveryFee,
        paymentMethod: order.paymentMethod,
        amountPaid: order.amountPaid,
        amountRefunded: order.amountRefunded ?? 0,
        balanceDue: order.balanceDue,
      },
      row.lines,
      rejectedGross >= activeGross - 0.001,
    );
  },

  async listRefundTransactions(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      RefundTransactionModel.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit),
      RefundTransactionModel.countDocuments({}),
    ]);

    return {
      items: rows.map((row) => ({
        id: String(row._id),
        parentOrderId: String(row.parentOrderId),
        returnId: String(row.returnId),
        paymentMethod: row.paymentMethod,
        merchandiseRefund: row.merchandiseRefund,
        couponShare: row.couponShare,
        deliveryFeeRefund: row.deliveryFeeRefund,
        cashRefundAmount: row.cashRefundAmount,
        balanceWaivedAmount: row.balanceWaivedAmount,
        currency: row.currency,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
    };
  },

  /** @deprecated Legacy approve path for old requested returns. */
  async approve(adminId: string, returnId: string) {
    const row = await ReturnRequestModel.findById(returnId);

    if (!row) {
      throw AppError.notFound('Return request not found');
    }

    if (row.status !== 'requested') {
      throw AppError.validation('Return is not awaiting approval');
    }

    row.status = 'approved';
    await row.save();

    return { id: String(row._id), status: row.status, reviewedBy: adminId };
  },

  /** @deprecated Prefer inspect → auto refund for delivery returns. */
  async markRefunded(adminId: string, returnId: string) {
    const row = await ReturnRequestModel.findById(returnId);

    if (!row) {
      throw AppError.notFound('Return request not found');
    }

    if (row.status === 'refunded') {
      return toReturnDto(row);
    }

    if (row.status === 'accepted') {
      return processAcceptedRefund(adminId, returnId);
    }

    throw AppError.validation('Return must be accepted before refund');
  },
};
