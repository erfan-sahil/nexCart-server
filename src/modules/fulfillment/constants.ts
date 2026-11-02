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
  'awaiting_items',
  'ready_to_pack',
  'shipped',
  'delivered',
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
