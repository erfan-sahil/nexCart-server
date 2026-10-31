import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, isProduction } from '../../config/env';
import { AppError } from '../../common/errors/AppError';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type SslcommerzMode = 'mock' | 'sandbox' | 'live';

export const sslcommerzMode = (): SslcommerzMode => {
  if (useMockGateway()) {
    return 'mock';
  }

  return env.SSLCOMMERZ_IS_SANDBOX ? 'sandbox' : 'live';
};

export const useMockGateway = () => {
  if (isProduction) {
    return false;
  }

  if (env.SSLCOMMERZ_MOCK) {
    return true;
  }

  return !env.SSLCOMMERZ_STORE_ID || !env.SSLCOMMERZ_STORE_PASSWORD;
};

const gatewayHost = () =>
  env.SSLCOMMERZ_IS_SANDBOX ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com';

export const mockPaymentSignature = (attemptId: string) =>
  createHmac('sha256', env.JWT_ACCESS_SECRET).update(`mock-pay:${attemptId}`).digest('hex');

export const verifyMockPaymentSignature = (attemptId: string, signature: string) => {
  const expected = mockPaymentSignature(attemptId);

  if (expected.length !== signature.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

type CreateSessionInput = {
  tranId: string;
  orderId: string;
  amount: number;
  currency: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  customerCountry: string;
};

type CreateSessionResult = {
  gatewayPageUrl: string;
  sessionKey: string;
};

export const buildCallbackUrls = (tranId: string) => {
  const base = env.PUBLIC_API_URL.replace(/\/$/, '');

  return {
    successUrl: `${base}/api/payments/sslcommerz/success`,
    failUrl: `${base}/api/payments/sslcommerz/fail`,
    cancelUrl: `${base}/api/payments/sslcommerz/cancel`,
    ipnUrl: `${base}/api/payments/sslcommerz/ipn`,
    tranId,
  };
};

export const buildMockGatewayUrl = (attemptId: string) => {
  const base = env.PUBLIC_API_URL.replace(/\/$/, '');
  const signature = mockPaymentSignature(attemptId);

  return `${base}/api/payments/sslcommerz/mock/${attemptId}?sig=${signature}`;
};

export const createSslcommerzSession = async (
  input: CreateSessionInput,
): Promise<CreateSessionResult> => {
  if (useMockGateway()) {
    throw AppError.internal('Mock gateway should not call SSLCommerz session API');
  }

  if (!env.SSLCOMMERZ_STORE_ID || !env.SSLCOMMERZ_STORE_PASSWORD) {
    throw AppError.serviceUnavailable(
      'SSLCommerz is not configured. Enable SSLCOMMERZ_MOCK for local testing or add sandbox store credentials.',
    );
  }

  const callbacks = buildCallbackUrls(input.tranId);
  const body = new URLSearchParams({
    store_id: env.SSLCOMMERZ_STORE_ID,
    store_passwd: env.SSLCOMMERZ_STORE_PASSWORD,
    total_amount: money(input.amount).toFixed(2),
    currency: input.currency,
    tran_id: input.tranId,
    success_url: callbacks.successUrl,
    fail_url: callbacks.failUrl,
    cancel_url: callbacks.cancelUrl,
    ipn_url: callbacks.ipnUrl,
    shipping_method: 'NO',
    product_name: 'NexCart order',
    product_category: 'General',
    product_profile: 'general',
    cus_name: input.customerName,
    cus_phone: input.customerPhone,
    cus_add1: input.customerAddress.slice(0, 160),
    cus_city: input.customerCity.slice(0, 80),
    cus_country: input.customerCountry.slice(0, 80),
    value_a: input.orderId,
  });

  const response = await fetch(`${gatewayHost()}/gwprocess/v4/api.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw AppError.serviceUnavailable('Payment gateway is unavailable');
  }

  const payload = (await response.json()) as {
    status?: string;
    GatewayPageURL?: string;
    sessionkey?: string;
    failedreason?: string;
  };

  if (payload.status !== 'SUCCESS' || !payload.GatewayPageURL) {
    throw AppError.serviceUnavailable(payload.failedreason ?? 'Could not start payment session');
  }

  return {
    gatewayPageUrl: payload.GatewayPageURL,
    sessionKey: payload.sessionkey ?? '',
  };
};

export type ValidationResult = {
  status: string;
  tranId: string;
  amount: number;
  currency: string;
  validationId: string;
  raw: Record<string, unknown>;
};

const readJsonString = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
};

export const validateSslcommerzPayment = async (
  validationId: string,
): Promise<ValidationResult> => {
  if (!env.SSLCOMMERZ_STORE_ID || !env.SSLCOMMERZ_STORE_PASSWORD) {
    throw AppError.serviceUnavailable('SSLCommerz is not configured');
  }

  const query = new URLSearchParams({
    val_id: validationId,
    store_id: env.SSLCOMMERZ_STORE_ID,
    store_passwd: env.SSLCOMMERZ_STORE_PASSWORD,
    format: 'json',
  });

  const response = await fetch(
    `${gatewayHost()}/validator/api/validationserverAPI.php?${query.toString()}`,
  );

  if (!response.ok) {
    throw AppError.serviceUnavailable('Could not validate payment');
  }

  const raw = (await response.json()) as Record<string, unknown>;
  const status = readJsonString(raw.status);
  const tranId = readJsonString(raw.tran_id);
  const amount = Number(raw.amount ?? raw.store_amount ?? 0);
  const currency = readJsonString(raw.currency) || readJsonString(raw.currency_type);

  return {
    status,
    tranId,
    amount: money(amount),
    currency,
    validationId,
    raw,
  };
};

export const clientRedirectUrl = (orderId: string, hint: 'success' | 'fail' | 'cancel') => {
  const base = env.CLIENT_APP_URL.replace(/\/$/, '');
  const params = new URLSearchParams({ orderId, result: hint });

  return `${base}/checkout/result?${params.toString()}`;
};

export const amountsMatch = (left: number, right: number) => money(left) === money(right);
