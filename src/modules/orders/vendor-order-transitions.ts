import type { VendorOrderStatus } from './constants';
import type { VendorOrder } from './vendor-order.model';

export const EARLY_FULFILLMENT_STATUSES = [
  'pending',
  'accepted',
  'preparing',
  'sending_to_warehouse',
] as const satisfies readonly VendorOrderStatus[];

type EarlyFulfillmentStatus = (typeof EARLY_FULFILLMENT_STATUSES)[number];

export const getVendorFulfillmentSteps = (
  from: VendorOrderStatus,
  to: VendorOrderStatus,
): VendorOrderStatus[] | null => {
  const fromIdx = EARLY_FULFILLMENT_STATUSES.indexOf(from as EarlyFulfillmentStatus);
  const toIdx = EARLY_FULFILLMENT_STATUSES.indexOf(to as EarlyFulfillmentStatus);

  if (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx) {
    return null;
  }

  return EARLY_FULFILLMENT_STATUSES.slice(fromIdx + 1, toIdx + 1);
};

const vendorTransitionAction = (status: VendorOrderStatus) => `vendor_order_${status}`;

const VENDOR_TRANSITIONS: Record<VendorOrderStatus, VendorOrderStatus[]> = {
  pending: ['accepted', 'cancelled'],
  accepted: ['preparing'],
  cancelled: [],
  preparing: ['sending_to_warehouse'],
  sending_to_warehouse: [],
  received_at_warehouse: [],
  inspecting: [],
  accepted_at_warehouse: [],
  partially_accepted: ['preparing'],
  rejected_at_warehouse: ['preparing'],
  packed: [],
  shipped: [],
  out_for_delivery: [],
  delivered: [],
  delivery_failed: [],
  customer_rejected: [],
  partially_rejected: [],
};

export const canVendorTransition = (from: VendorOrderStatus, to: VendorOrderStatus) => {
  if (to === 'cancelled') {
    return from === 'pending';
  }

  if (getVendorFulfillmentSteps(from, to)?.length) {
    return true;
  }

  return VENDOR_TRANSITIONS[from]?.includes(to) ?? false;
};

export const vendorOrderStepAction = (status: VendorOrderStatus) => vendorTransitionAction(status);

export const vendorOrderIsActiveForPack = (row: Pick<VendorOrder, 'status'>) =>
  row.status !== 'cancelled';

export const vendorOrderLinesPackReady = (row: VendorOrder) =>
  row.items.every((line) => line.acceptedQtyCumulative === line.targetQty);

export const outstandingQtyForLine = (line: { targetQty: number; acceptedQtyCumulative: number }) =>
  Math.max(0, line.targetQty - line.acceptedQtyCumulative);
