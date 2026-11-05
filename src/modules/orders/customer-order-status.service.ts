import type { Order } from './order.model';
import type { CustomerOrderStatus } from './constants';
import type { VendorOrder } from './vendor-order.model';

const ACTIVE_VENDOR_STATUSES = new Set([
  'pending',
  'accepted',
  'preparing',
  'sending_to_warehouse',
  'received_at_warehouse',
  'inspecting',
  'accepted_at_warehouse',
  'partially_accepted',
  'rejected_at_warehouse',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'customer_rejected',
  'partially_rejected',
]);

const vendorMilestoneRank = (status: VendorOrder['status']) => {
  const ranks: Record<string, number> = {
    pending: 0,
    accepted: 1,
    preparing: 1,
    cancelled: -1,
    sending_to_warehouse: 2,
    received_at_warehouse: 2,
    inspecting: 2,
    accepted_at_warehouse: 2,
    partially_accepted: 2,
    rejected_at_warehouse: 2,
    packed: 2,
    shipped: 2,
    out_for_delivery: 3,
    delivered: 4,
    delivery_failed: 3,
    customer_rejected: 3,
    partially_rejected: 4,
  };

  return ranks[status] ?? 0;
};

export const projectCustomerStatusWithVendorOrders = (
  order: Pick<Order, 'status' | 'fulfillmentStatus' | 'paymentMethod'>,
  vendorOrders: Pick<VendorOrder, 'status'>[],
  shipmentStatus?: string | null,
  refundStatus?: string | null,
): CustomerOrderStatus => {
  if (order.status === 'cancelled' || order.fulfillmentStatus === 'cancelled') {
    return 'cancelled';
  }

  if (order.status === 'expired') {
    return 'expired';
  }

  if (order.status === 'awaiting_payment') {
    return 'awaiting_payment';
  }

  if (refundStatus === 'refunded') {
    return order.fulfillmentStatus === 'partially_returned' ? 'delivered' : 'refunded';
  }

  if (refundStatus === 'refund_processing' || refundStatus === 'accepted') {
    return 'refund_processing';
  }

  if (shipmentStatus === 'returning_to_warehouse' || shipmentStatus === 'returned_to_warehouse') {
    return 'returning_to_warehouse';
  }

  if (shipmentStatus === 'delivery_failed') {
    return 'delivery_failed';
  }

  if (shipmentStatus === 'customer_rejected') {
    return 'customer_rejected';
  }

  if (order.status === 'delivered' || order.fulfillmentStatus === 'delivered') {
    return 'delivered';
  }

  if (order.fulfillmentStatus === 'partially_returned' && shipmentStatus !== 'out_for_delivery') {
    return 'delivered';
  }

  if (shipmentStatus === 'out_for_delivery') {
    return 'out_for_delivery';
  }

  const active = vendorOrders.filter((row) => ACTIVE_VENDOR_STATUSES.has(row.status));

  if (active.length === 0) {
    return 'confirmed';
  }

  const minRank = Math.min(...active.map((row) => vendorMilestoneRank(row.status)));

  if (minRank >= 4) {
    return 'delivered';
  }

  if (minRank >= 3) {
    return 'out_for_delivery';
  }

  if (minRank >= 2) {
    return 'shipped_to_warehouse';
  }

  if (minRank >= 1) {
    return 'product_accepted';
  }

  return 'confirmed';
};
