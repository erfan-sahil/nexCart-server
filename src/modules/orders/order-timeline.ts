import type { Order } from './order.model';
import type { Shipment } from '../fulfillment/shipment.model';
import type { CustomerOrderStatus } from './constants';
import type { VendorOrder } from './vendor-order.model';
import { projectCustomerStatusWithVendorOrders } from './customer-order-status.service';
import { projectCustomerStatus } from './order-status';

export type CustomerTimelineStep = {
  id: string;
  label: string;
  at: string | null;
  completed: boolean;
};

const customerStatusRank = (
  status: CustomerOrderStatus | ReturnType<typeof projectCustomerStatus>,
) => {
  const ranks: Record<string, number> = {
    awaiting_payment: 0,
    expired: 0,
    cancelled: 0,
    confirmed: 1,
    product_accepted: 2,
    shipped_to_warehouse: 3,
    out_for_delivery: 4,
    delivered: 5,
    delivery_failed: 5,
    customer_rejected: 5,
    returning_to_warehouse: 6,
    refund_processing: 7,
    refunded: 8,
    shipped: 3,
  };

  return ranks[status] ?? 0;
};

export const projectCustomerTimeline = (input: {
  order: Order;
  shipment: Shipment | null;
  vendorOrders?: Pick<VendorOrder, 'status'>[];
  refundStatus?: string | null;
}): CustomerTimelineStep[] => {
  const { order, shipment, vendorOrders, refundStatus } = input;

  const projected = vendorOrders?.length
    ? projectCustomerStatusWithVendorOrders(
        order,
        vendorOrders,
        shipment?.status ?? null,
        refundStatus,
      )
    : projectCustomerStatus(order);

  const rank = customerStatusRank(projected);
  const placedAt = order.createdAt.toISOString();
  const shippedAt = shipment?.shippedAt?.toISOString() ?? null;
  const deliveredAt = shipment?.deliveredAt?.toISOString() ?? null;
  const updatedAt = order.updatedAt.toISOString();

  if (projected === 'cancelled' || projected === 'expired') {
    return [
      {
        id: 'placed',
        label: 'Order placed',
        at: placedAt,
        completed: true,
      },
      {
        id: projected,
        label: projected === 'cancelled' ? 'Order cancelled' : 'Order expired',
        at: order.updatedAt.toISOString(),
        completed: true,
      },
    ];
  }

  if (projected === 'awaiting_payment') {
    return [
      { id: 'placed', label: 'Order placed', at: placedAt, completed: true },
      {
        id: 'awaiting_payment',
        label: 'Awaiting payment',
        at: placedAt,
        completed: false,
      },
    ];
  }

  const steps: CustomerTimelineStep[] = [
    {
      id: 'confirmed',
      label: 'Order confirmed',
      at: placedAt,
      completed: rank >= 1,
    },
    {
      id: 'product_accepted',
      label: 'Products accepted by vendors',
      at: rank >= 2 ? placedAt : null,
      completed: rank >= 2,
    },
    {
      id: 'shipped_to_warehouse',
      label: 'Products on the way to NexCart',
      at: rank >= 3 ? (shippedAt ?? placedAt) : null,
      completed: rank >= 3,
    },
    {
      id: 'out_for_delivery',
      label: 'Out for delivery',
      at: rank >= 4 ? shippedAt : null,
      completed: rank >= 4,
    },
  ];

  if (
    projected === 'delivery_failed' ||
    projected === 'customer_rejected' ||
    projected === 'returning_to_warehouse' ||
    projected === 'refund_processing' ||
    projected === 'refunded'
  ) {
    steps.push({
      id: projected === 'customer_rejected' ? 'customer_rejected' : 'delivery_failed',
      label:
        projected === 'customer_rejected' || shipment?.status === 'customer_rejected'
          ? 'Customer rejected delivery'
          : 'Delivery failed',
      at: updatedAt,
      completed: true,
    });

    if (rank >= 6) {
      steps.push({
        id: 'returning_to_warehouse',
        label: 'Returning to NexCart warehouse',
        at: updatedAt,
        completed: true,
      });
    }

    if (rank >= 7) {
      steps.push({
        id: 'refund_processing',
        label: 'Refund processing',
        at: updatedAt,
        completed: true,
      });
    }

    if (rank >= 8) {
      steps.push({
        id: 'refunded',
        label: 'Refunded',
        at: updatedAt,
        completed: true,
      });
    }

    return steps;
  }

  steps.push({
    id: 'delivered',
    label: 'Delivered',
    at: deliveredAt,
    completed: rank >= 5,
  });

  return steps;
};
