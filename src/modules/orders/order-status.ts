import type { Order } from './order.model';
import type { CustomerOrderStatus, OrderFulfillmentStatus, OrderStatus } from './constants';

/** Legacy coarse projection when vendor orders are not loaded. */
export const projectCustomerStatus = (
  order: Pick<Order, 'status' | 'fulfillmentStatus'>,
): OrderStatus | CustomerOrderStatus => {
  if (order.status === 'cancelled' || order.fulfillmentStatus === 'cancelled') {
    return 'cancelled';
  }

  if (order.status === 'expired') {
    return 'expired';
  }

  if (order.status === 'awaiting_payment') {
    return 'awaiting_payment';
  }

  if (order.status === 'delivered' || order.fulfillmentStatus === 'delivered') {
    return 'delivered';
  }

  if (order.status === 'shipped' || order.fulfillmentStatus === 'shipped') {
    return 'confirmed';
  }

  if (
    order.status === 'confirmed' ||
    order.fulfillmentStatus === 'confirmed' ||
    order.fulfillmentStatus === 'processing' ||
    order.fulfillmentStatus === 'ready_for_dispatch'
  ) {
    return 'confirmed';
  }

  return order.status;
};

export const defaultFulfillmentStatus = (
  order: Pick<Order, 'fulfillmentStatus' | 'status'>,
): OrderFulfillmentStatus => {
  if (order.fulfillmentStatus) {
    return order.fulfillmentStatus;
  }

  if (order.status === 'awaiting_payment') {
    return 'placed';
  }

  if (order.status === 'confirmed') {
    return 'confirmed';
  }

  if (order.status === 'shipped') {
    return 'shipped';
  }

  if (order.status === 'delivered') {
    return 'delivered';
  }

  if (order.status === 'cancelled') {
    return 'cancelled';
  }

  return 'placed';
};
