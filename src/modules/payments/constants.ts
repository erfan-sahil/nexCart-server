export const PAYMENT_PURPOSES = ['order_total', 'delivery_fee'] as const;

export const PAYMENT_ATTEMPT_STATUSES = [
  'pending',
  'succeeded',
  'failed',
  'cancelled',
  'superseded',
  'paid_unapplied',
] as const;

export const SSLCOMMERZ_SUCCESS_STATUSES = ['VALID', 'VALIDATED'] as const;

export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];
export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number];
