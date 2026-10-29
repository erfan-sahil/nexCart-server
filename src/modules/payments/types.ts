import type { PaymentAttemptStatus, PaymentPurpose } from './constants';

export type PaymentInitiateDto = {
  attemptId: string;
  tranId: string;
  orderId: string;
  amount: number;
  currency: string;
  purpose: PaymentPurpose;
  gatewayPageUrl: string;
  mode: 'mock' | 'sandbox' | 'live';
};

export type PaymentAttemptDto = {
  id: string;
  tranId: string;
  status: PaymentAttemptStatus;
  amount: number;
  currency: string;
  purpose: PaymentPurpose;
  createdAt: string;
};
