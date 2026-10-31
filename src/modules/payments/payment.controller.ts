import type { Request, Response } from 'express';
import { Permission } from '../../common/constants/permissions';
import { env, isProduction } from '../../config/env';
import { asyncHandler } from '../../common/http/asyncHandler';
import { readIdempotencyKey } from '../../common/utils/idempotency';
import { sendCreated } from '../../common/http/sendResponse';
import { AppError } from '../../common/errors/AppError';
import { paymentService } from './payment.service';
import {
  markAttemptCancelled,
  markAttemptFailed,
  settleFromGatewayValidation,
  settleMockPayment,
} from './settle.service';
import { clientRedirectUrl, verifyMockPaymentSignature } from './sslcommerz.client';

const actorId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const routeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const gatewaySnapshot = (req: Request): Record<string, unknown> => ({
  query: req.query,
  body: req.body,
});

const readGatewayField = (req: Request, key: string) => {
  const body = req.body as Record<string, unknown>;
  const fromBody = body[key];
  const fromQuery = req.query[key];

  if (typeof fromBody === 'string' && fromBody.length > 0) {
    return fromBody;
  }

  if (typeof fromQuery === 'string' && fromQuery.length > 0) {
    return fromQuery;
  }

  return '';
};

const initiateForOrder = asyncHandler(async (req: Request, res: Response) => {
  const orderId = routeParam(req.params.orderId);
  const idempotencyKey = readIdempotencyKey(req.headers['idempotency-key']);
  const data = await paymentService.initiate({ customerId: actorId(req) }, orderId, idempotencyKey);

  sendCreated(res, data, 'Payment initiated');
});

const handleSuccess = asyncHandler(async (req: Request, res: Response) => {
  const tranId = readGatewayField(req, 'tran_id');
  const valId = readGatewayField(req, 'val_id');

  if (tranId && valId) {
    try {
      await settleFromGatewayValidation(valId, tranId, 'redirect');
    } catch {
      // Redirect still happens; client should read order status from the API.
    }
  }

  const orderId = readGatewayField(req, 'value_a') || readGatewayField(req, 'order_id');
  const redirect = clientRedirectUrl(orderId || '', 'success');

  res.redirect(302, redirect);
});

const handleFail = asyncHandler(async (req: Request, res: Response) => {
  const tranId = readGatewayField(req, 'tran_id');

  if (tranId) {
    await markAttemptFailed(tranId, gatewaySnapshot(req));
  }

  const orderId = readGatewayField(req, 'value_a') || readGatewayField(req, 'order_id');
  res.redirect(302, clientRedirectUrl(orderId || '', 'fail'));
});

const handleCancel = asyncHandler(async (req: Request, res: Response) => {
  const tranId = readGatewayField(req, 'tran_id');

  if (tranId) {
    await markAttemptCancelled(tranId, gatewaySnapshot(req));
  }

  const orderId = readGatewayField(req, 'value_a') || readGatewayField(req, 'order_id');
  res.redirect(302, clientRedirectUrl(orderId || '', 'cancel'));
});

const handleIpn = asyncHandler(async (req: Request, res: Response) => {
  const tranId = readGatewayField(req, 'tran_id');
  const valId = readGatewayField(req, 'val_id');
  const status = readGatewayField(req, 'status');

  if (!tranId || !valId) {
    res.status(400).send('INVALID');
    return;
  }

  try {
    if (status.toUpperCase() === 'VALID' || status.toUpperCase() === 'VALIDATED') {
      await settleFromGatewayValidation(valId, tranId, 'ipn');
    } else if (status.toUpperCase() === 'CANCELLED') {
      await markAttemptCancelled(tranId, gatewaySnapshot(req));
    } else {
      await markAttemptFailed(tranId, gatewaySnapshot(req));
    }

    res.status(200).send('SUCCESS');
  } catch {
    res.status(500).send('FAILED');
  }
});

const handleMockPay = asyncHandler(async (req: Request, res: Response) => {
  if (isProduction) {
    throw AppError.notFound('Not found');
  }

  const attemptId = routeParam(req.params.attemptId);
  const signature =
    typeof req.query.sig === 'string'
      ? req.query.sig
      : Array.isArray(req.query.sig) && typeof req.query.sig[0] === 'string'
        ? req.query.sig[0]
        : '';

  if (!verifyMockPaymentSignature(attemptId, signature)) {
    throw AppError.forbidden('Invalid mock payment link');
  }

  const order = await settleMockPayment(attemptId);
  const orderId = order?.id ?? '';

  res.redirect(302, clientRedirectUrl(orderId, 'success'));
});

const mockInfo = asyncHandler(async (_req: Request, res: Response) => {
  if (isProduction) {
    throw AppError.notFound('Not found');
  }

  await Promise.resolve();
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8"><title>NexCart mock payment</title></head>
  <body style="font-family: system-ui; max-width: 32rem; margin: 3rem auto; line-height: 1.5;">
    <h1>Mock SSLCommerz (free sandbox)</h1>
    <p>No real money moves. Default for local development when <code>SSLCOMMERZ_MOCK=true</code>.</p>
    <p>Start checkout from the app, then open the <code>gatewayPageUrl</code> returned by <code>POST /api/orders/:id/payments</code>.</p>
    <p>API base: <code>${env.PUBLIC_API_URL}</code></p>
  </body>
</html>`);
});

export const paymentController = {
  initiateForOrder,
  handleSuccess,
  handleFail,
  handleCancel,
  handleIpn,
  handleMockPay,
  mockInfo,
};

export const paymentPermissions = {
  initiate: Permission.customerPayment,
};
