export const ORDER_PAYMENT_METHODS = ['prepaid', 'cod'] as const;

export const ORDER_STATUSES = [
  'awaiting_payment',
  'confirmed',
  'shipped',
  'delivered',
  'expired',
  'cancelled',
] as const;

export const ORDER_FULFILLMENT_STATUSES = [
  'placed',
  'confirmed',
  'processing',
  'ready_for_dispatch',
  'shipped',
  'delivered',
  'cancelled',
  'partially_cancelled',
  'partially_returned',
  'returned',
] as const;

export const VENDOR_ORDER_STATUSES = [
  'pending',
  'accepted',
  'preparing',
  'ready_to_ship',
  'in_transit',
  'received',
  'partially_received',
  'exception',
  'completed',
  'cancelled',
] as const;

export const STOCK_CUSTODIES = [
  'at_vendor',
  'inbound_transit',
  'at_warehouse',
  'rejected_at_warehouse',
  'missing',
  'packed',
  'outbound',
  'delivered',
  'returned_to_warehouse',
  'returned_to_vendor',
] as const;

export const STOCK_MOVEMENT_DIRECTIONS = ['decrement', 'increment'] as const;

export const ORDER_PAYMENT_STATUSES = ['unpaid', 'partially_paid', 'paid'] as const;

export const COD_COLLECTION_STATUSES = ['not_applicable', 'pending', 'collected'] as const;

export const ORDER_CURRENCY = 'BDT';

export const MAX_ORDER_LINE_QUANTITY = 99;

export const MAX_ORDER_LINES = 50;

export const IDEMPOTENCY_KEY_MIN = 1;

export const IDEMPOTENCY_KEY_MAX = 255;

export const IDEMPOTENCY_TTL_HOURS = 24;

export const IdempotencyScope = {
  orderCreate: 'order.create',
  paymentInitiate: 'payment.initiate',
} as const;

export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];
export type CodCollectionStatus = (typeof COD_COLLECTION_STATUSES)[number];
export type OrderFulfillmentStatus = (typeof ORDER_FULFILLMENT_STATUSES)[number];
export type VendorOrderStatus = (typeof VENDOR_ORDER_STATUSES)[number];
export type StockCustody = (typeof STOCK_CUSTODIES)[number];
export type StockMovementDirection = (typeof STOCK_MOVEMENT_DIRECTIONS)[number];
