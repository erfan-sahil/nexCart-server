import type { InboundBatch } from './inbound-batch.model';
import type { OrderActivity } from './order-activity.model';
import type { Order } from './order.model';
import type { RejectReturn } from './reject-return.model';
import type { VendorOrder } from './vendor-order.model';
import type { Shipment } from '../fulfillment/shipment.model';
import { defaultFulfillmentStatus, projectCustomerStatus } from './order-status';
import { projectCustomerStatusWithVendorOrders } from './customer-order-status.service';
import { toOrderDto } from './order.mapper';
import type {
  AdminOrderDetailDto,
  AdminOrderListItemDto,
  AdminShipmentDto,
  AdminVendorOrderDto,
  InboundBatchDto,
  OrderActivityDto,
  RejectReturnDto,
  VendorOrderDto,
  VendorOrderSummaryDto,
} from './vendor-order.types';

export const toInboundBatchDto = (batch: InboundBatch): InboundBatchDto => ({
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
    rejectionReason: line.rejectionReason ?? null,
    rejectionNote: line.rejectionNote ?? '',
  })),
  dispatchedAt: batch.dispatchedAt.toISOString(),
  receivedAt: batch.receivedAt?.toISOString() ?? null,
  inspectedAt: batch.inspectedAt?.toISOString() ?? null,
});

export const toRejectReturnDto = (ret: RejectReturn): RejectReturnDto => ({
  id: String(ret._id),
  inboundBatchId: String(ret.inboundBatchId),
  status: ret.status,
  lines: ret.lines.map((line) => ({
    variantId: String(line.variantId),
    sku: line.sku,
    quantity: line.quantity,
    rejectionReason: line.rejectionReason,
    rejectionNote: line.rejectionNote ?? '',
  })),
  sentToVendorAt: ret.sentToVendorAt?.toISOString() ?? null,
  receivedByVendorAt: ret.receivedByVendorAt?.toISOString() ?? null,
});

export const toAdminShipmentDto = (row: Shipment): AdminShipmentDto => ({
  status: row.status,
  carrier: row.carrier ?? '',
  trackingNumber: row.trackingNumber ?? '',
  packedAt: row.packedAt?.toISOString() ?? null,
  shippedAt: row.shippedAt?.toISOString() ?? null,
  deliveredAt: row.deliveredAt?.toISOString() ?? null,
});

export const toAdminVendorOrderDto = (
  row: VendorOrder,
  batches: InboundBatch[],
  rejectReturns: RejectReturn[],
): AdminVendorOrderDto => ({
  ...toVendorOrderDto(row),
  inboundBatches: batches.map(toInboundBatchDto),
  rejectReturns: rejectReturns.map(toRejectReturnDto),
});

export const toVendorOrderDto = (row: VendorOrder): VendorOrderDto => ({
  id: String(row._id),
  parentOrderId: String(row.parentOrderId),
  orderNumber: row.orderNumber,
  vendorOrderNumber: row.vendorOrderNumber,
  storeId: String(row.storeId),
  storeName: row.storeName,
  status: row.status,
  items: row.items.map((item) => ({
    variantId: String(item.variantId),
    productId: String(item.productId),
    productName: item.productName,
    sku: item.sku,
    quantity: item.quantity,
    expectedQty: item.expectedQty ?? item.quantity,
    targetQty: item.targetQty ?? item.quantity,
    acceptedQtyCumulative: item.acceptedQtyCumulative ?? 0,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  })),
  itemsSubtotal: row.itemsSubtotal,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const toOrderActivityDto = (
  row: Pick<
    OrderActivity,
    | '_id'
    | 'parentOrderId'
    | 'vendorOrderId'
    | 'actorUserId'
    | 'actorRole'
    | 'action'
    | 'metadata'
    | 'createdAt'
  >,
): OrderActivityDto => ({
  id: String(row._id),
  parentOrderId: String(row.parentOrderId),
  vendorOrderId: row.vendorOrderId ? String(row.vendorOrderId) : null,
  actorUserId: String(row.actorUserId),
  actorRole: row.actorRole,
  action: row.action,
  metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  createdAt: row.createdAt.toISOString(),
});

export const toAdminOrderListItem = (order: Order): AdminOrderListItemDto => ({
  id: String(order._id),
  orderNumber: order.orderNumber,
  status: projectCustomerStatus(order),
  fulfillmentStatus: defaultFulfillmentStatus(order),
  paymentStatus: order.paymentStatus,
  paymentMethod: order.paymentMethod,
  grandTotal: order.grandTotal,
  currency: order.currency,
  vendorOrderCount: 0,
  createdAt: order.createdAt.toISOString(),
});

export const toAdminOrderDetail = (
  order: Order,
  vendorOrders: AdminVendorOrderDto[],
  activity: OrderActivityDto[],
  shipment: AdminShipmentDto | null,
): AdminOrderDetailDto => {
  const customerStatus = projectCustomerStatusWithVendorOrders(
    order,
    vendorOrders,
    shipment?.status ?? null,
  );

  return {
    ...toAdminOrderListItem(order),
    status: customerStatus,
    vendorOrderCount: vendorOrders.length,
    shipping: {
      recipientName: order.shipping.recipientName,
      phone: order.shipping.phone,
      line1: order.shipping.line1,
      line2: order.shipping.line2 ?? '',
      city: order.shipping.city,
      state: order.shipping.state,
      postalCode: order.shipping.postalCode,
      country: order.shipping.country,
    },
    payment: {
      amountPaid: order.amountPaid,
      balanceDue: order.balanceDue,
      codCollectionStatus: order.codCollectionStatus,
    },
    totals: toOrderDto(order).totals,
    shipment,
    vendorOrders,
    activity,
    canCancel: false,
  };
};

export const toVendorOrderSummary = (counts: Record<string, number>): VendorOrderSummaryDto => ({
  total: counts.total ?? 0,
  pending: counts.pending ?? 0,
  accepted: counts.accepted ?? 0,
  preparing: counts.preparing ?? 0,
  sendingToWarehouse: counts.sending_to_warehouse ?? 0,
  receivedAtWarehouse: counts.received_at_warehouse ?? 0,
  inspecting: counts.inspecting ?? 0,
  acceptedAtWarehouse: counts.accepted_at_warehouse ?? 0,
  partiallyAccepted: counts.partially_accepted ?? 0,
  rejectedAtWarehouse: counts.rejected_at_warehouse ?? 0,
  packed: counts.packed ?? 0,
  shipped: counts.shipped ?? 0,
  outForDelivery: counts.out_for_delivery ?? 0,
  delivered: counts.delivered ?? 0,
});
