export const VENDOR_FULFILLMENT_STATUSES = [
  'pending',
  'dispatched',
  'received',
  'inspected',
] as const;

export const SHIPMENT_STATUSES = [
  'awaiting_items',
  'ready_to_pack',
  'shipped',
  'delivered',
] as const;

export type VendorFulfillmentStatus = (typeof VENDOR_FULFILLMENT_STATUSES)[number];
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const VENDOR_FULFILLMENT_SORTS = [
  'createdAt',
  '-createdAt',
  'updatedAt',
  '-updatedAt',
] as const;
