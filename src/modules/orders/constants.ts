export const ORDER_PAYMENT_METHODS = ['prepaid', 'cod'] as const;

export const ORDER_STATUSES = [
  'awaiting_payment',
  'confirmed',
  'shipped',
  'delivered',
  'expired',
] as const;

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
