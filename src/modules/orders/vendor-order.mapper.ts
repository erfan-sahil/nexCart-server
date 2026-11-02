import type { OrderActivity } from './order-activity.model';
import type { Order } from './order.model';
import type { VendorOrder } from './vendor-order.model';
import { defaultFulfillmentStatus, projectCustomerStatus } from './order-status';
import { toOrderDto } from './order.mapper';
import type {
  AdminOrderDetailDto,
  AdminOrderListItemDto,
  OrderActivityDto,
  VendorOrderDto,
  VendorOrderSummaryDto,
} from './vendor-order.types';

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
  vendorOrders: VendorOrder[],
  activity: OrderActivityDto[],
): AdminOrderDetailDto => ({
  ...toAdminOrderListItem(order),
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
  vendorOrders: vendorOrders.map(toVendorOrderDto),
  activity,
  canCancel: false,
});

export const toVendorOrderSummary = (counts: Record<string, number>): VendorOrderSummaryDto => ({
  total: counts.total ?? 0,
  pending: counts.pending ?? 0,
  accepted: counts.accepted ?? 0,
  preparing: counts.preparing ?? 0,
  readyToShip: counts.ready_to_ship ?? 0,
  inTransit: counts.in_transit ?? 0,
  completed: counts.completed ?? 0,
});
