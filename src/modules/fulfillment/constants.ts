export const VENDOR_FULFILLMENT_STATUSES = [
  'pending',
  'dispatched',
  'in_transit',
  'received',
  'inspecting',
  'accepted',
  'partially_accepted',
  'rejected',
] as const;

export const FULFILLMENT_REJECTION_REASONS = ['damaged', 'incorrect', 'missing', 'other'] as const;

export const SHIPMENT_STATUSES = [
  'pending',
  'packed',
  'dispatched',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'customer_rejected',
  'returning_to_warehouse',
  'returned_to_warehouse',
  'awaiting_items',
  'ready_to_pack',
  'shipped',
] as const;

export type FulfillmentRejectionReason = (typeof FULFILLMENT_REJECTION_REASONS)[number];
export type VendorFulfillmentStatus = (typeof VENDOR_FULFILLMENT_STATUSES)[number];
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const VENDOR_FULFILLMENT_SORTS = [
  'createdAt',
  '-createdAt',
  'updatedAt',
  '-updatedAt',
] as const;
