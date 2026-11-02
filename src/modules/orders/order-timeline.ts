import type { Order } from './order.model';
import type { Shipment } from '../fulfillment/shipment.model';
import type { VendorFulfillment } from '../fulfillment/vendor-fulfillment.model';

export type CustomerTimelineStep = {
  id: string;
  label: string;
  at: string | null;
  completed: boolean;
};

export const projectCustomerTimeline = (input: {
  order: Order;
  shipment: Shipment | null;
  fulfillments: VendorFulfillment[];
}): CustomerTimelineStep[] => {
  const { order, shipment, fulfillments } = input;

  const placedAt = order.createdAt.toISOString();
  const anyPreparing = fulfillments.some((row) =>
    ['pending', 'dispatched', 'in_transit'].includes(row.status),
  );
  const anyAtWarehouse = fulfillments.some((row) =>
    ['received', 'inspecting', 'accepted', 'partially_accepted', 'rejected'].includes(row.status),
  );
  const allInspected = fulfillments.every((row) =>
    ['accepted', 'partially_accepted', 'rejected'].includes(row.status),
  );

  const packedAt = shipment?.packedAt?.toISOString() ?? null;
  const shippedAt = shipment?.shippedAt?.toISOString() ?? null;
  const deliveredAt = shipment?.deliveredAt?.toISOString() ?? null;

  const steps: CustomerTimelineStep[] = [
    { id: 'placed', label: 'Order placed', at: placedAt, completed: true },
    {
      id: 'preparing',
      label: 'Vendors preparing products',
      at: anyPreparing ? placedAt : null,
      completed: anyPreparing || anyAtWarehouse || allInspected,
    },
    {
      id: 'at_warehouse',
      label: 'Products arrived at NexCart warehouse',
      at: anyAtWarehouse ? placedAt : null,
      completed: anyAtWarehouse,
    },
    {
      id: 'inspected',
      label: 'Warehouse inspection completed',
      at: allInspected ? placedAt : null,
      completed: allInspected,
    },
    {
      id: 'packing',
      label: 'Products being packed',
      at: packedAt,
      completed: Boolean(packedAt),
    },
    {
      id: 'shipped',
      label: 'Order shipped',
      at: shippedAt,
      completed: Boolean(shippedAt),
    },
    {
      id: 'out_for_delivery',
      label: 'Out for delivery',
      at: shipment?.status === 'out_for_delivery' ? shippedAt : null,
      completed: shipment?.status === 'out_for_delivery' || shipment?.status === 'delivered',
    },
    {
      id: 'delivered',
      label: 'Delivered',
      at: deliveredAt,
      completed: shipment?.status === 'delivered' || order.status === 'delivered',
    },
  ];

  return steps;
};
