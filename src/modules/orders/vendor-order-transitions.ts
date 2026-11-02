import type { VendorOrderStatus } from './constants';
import type { VendorOrder } from './vendor-order.model';

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
};

export const canVendorTransition = (from: VendorOrderStatus, to: VendorOrderStatus) =>
  VENDOR_TRANSITIONS[from]?.includes(to) ?? false;

export const vendorOrderIsActiveForPack = (row: Pick<VendorOrder, 'status'>) =>
  row.status !== 'cancelled';

export const vendorOrderLinesPackReady = (row: VendorOrder) =>
  row.items.every((line) => line.acceptedQtyCumulative === line.targetQty);

export const outstandingQtyForLine = (line: { targetQty: number; acceptedQtyCumulative: number }) =>
  Math.max(0, line.targetQty - line.acceptedQtyCumulative);
