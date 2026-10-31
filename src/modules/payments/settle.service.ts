import type { Types } from 'mongoose';
import { OrderModel, type Order } from '../../models/order.model';
import { PaymentAttemptModel } from '../../models/paymentAttempt.model';
import type { PaymentAttempt } from '../../models/paymentAttempt.model';
import { AppError } from '../../utils/AppError';
import { toOrderDto } from '../orders/order.mapper';
import { releaseExpiredOrderHolds } from '../orders/stock';
import { fulfillmentService } from '../fulfillment/fulfillment.service';
import type { CodCollectionStatus, OrderPaymentStatus } from '../orders/constants';
import type { OrderDto } from '../orders/types';
import { SSLCOMMERZ_SUCCESS_STATUSES } from './constants';
import { amountsMatch, validateSslcommerzPayment } from './sslcommerz.client';

type SettleInput = {
  tranId: string;
  validationId: string;
  gatewayStatus: string;
  amount: number;
  currency: string;
  gatewayPayload: Record<string, unknown>;
  source: 'ipn' | 'redirect' | 'mock';
};

const purposeForOrder = (order: Order) =>
  order.paymentMethod === 'prepaid' ? 'order_total' : 'delivery_fee';

const paymentTotalsForOrder = (order: Order) => {
  if (order.paymentMethod === 'prepaid') {
    return {
      amountPaid: order.grandTotal,
      balanceDue: 0,
      paymentStatus: 'paid' as const,
    };
  }

  return {
    amountPaid: order.deliveryFee,
    balanceDue: order.itemsSubtotal,
    paymentStatus: 'partially_paid' as const,
  };
};

const markAttempt = async (
  attemptId: Types.ObjectId,
  update: Partial<
    Pick<PaymentAttempt, 'status' | 'validationId' | 'gatewayStatus' | 'gatewayPayload'>
  >,
) => {
  await PaymentAttemptModel.updateOne({ _id: attemptId }, { $set: update });
};

export const confirmOrderWithNothingDue = async (order: Order): Promise<OrderDto> => {
  if (order.status === 'confirmed') {
    return toOrderDto(order);
  }

  const now = new Date();
  const nothingToCollect = order.itemsSubtotal <= 0;
  const totals =
    order.paymentMethod === 'prepaid' || nothingToCollect
      ? {
          amountPaid: 0,
          balanceDue: 0,
          paymentStatus: 'paid' as OrderPaymentStatus,
          codCollectionStatus: 'not_applicable' as CodCollectionStatus,
        }
      : {
          amountPaid: 0,
          balanceDue: order.itemsSubtotal,
          paymentStatus: 'unpaid' as OrderPaymentStatus,
          codCollectionStatus: 'pending' as CodCollectionStatus,
        };

  const confirmed = await OrderModel.findOneAndUpdate(
    {
      _id: order._id,
      status: 'awaiting_payment',
      stockReleasedAt: null,
      stockHoldExpiresAt: { $gt: now },
    },
    { $set: { status: 'confirmed', ...totals } },
    { new: true },
  );

  if (!confirmed) {
    const latest = await OrderModel.findById(order._id);

    if (latest?.status === 'confirmed') {
      return toOrderDto(latest);
    }

    throw AppError.validation('This order can no longer be confirmed');
  }

  await fulfillmentService.bootstrapForOrder(confirmed._id);

  return toOrderDto(confirmed);
};

export const settlePayment = async (input: SettleInput): Promise<OrderDto | null> => {
  await releaseExpiredOrderHolds();

  const attempt = await PaymentAttemptModel.findOne({ tranId: input.tranId });

  if (!attempt) {
    throw AppError.notFound('Payment attempt not found');
  }

  if (attempt.status === 'succeeded') {
    const order = await OrderModel.findById(attempt.orderId);

    if (!order) {
      throw AppError.notFound('Order not found');
    }

    return toOrderDto(order);
  }

  if (attempt.status !== 'pending') {
    return null;
  }

  if (!amountsMatch(attempt.amount, input.amount)) {
    await markAttempt(attempt._id, {
      status: 'failed',
      validationId: input.validationId,
      gatewayStatus: input.gatewayStatus,
      gatewayPayload: input.gatewayPayload,
    });

    throw AppError.validation('Payment amount does not match the order');
  }

  if (input.currency.toUpperCase() !== attempt.currency.toUpperCase()) {
    await markAttempt(attempt._id, {
      status: 'failed',
      validationId: input.validationId,
      gatewayStatus: input.gatewayStatus,
      gatewayPayload: input.gatewayPayload,
    });

    throw AppError.validation('Payment currency does not match the order');
  }

  const order = await OrderModel.findById(attempt.orderId);

  if (!order) {
    throw AppError.notFound('Order not found');
  }

  if (attempt.purpose !== purposeForOrder(order)) {
    await markAttempt(attempt._id, { status: 'failed', gatewayPayload: input.gatewayPayload });
    throw AppError.validation('Payment purpose does not match this order');
  }

  const successStatuses: readonly string[] = SSLCOMMERZ_SUCCESS_STATUSES;

  if (!successStatuses.includes(input.gatewayStatus.toUpperCase())) {
    await markAttempt(attempt._id, {
      status: input.gatewayStatus.toUpperCase() === 'CANCELLED' ? 'cancelled' : 'failed',
      validationId: input.validationId,
      gatewayStatus: input.gatewayStatus,
      gatewayPayload: input.gatewayPayload,
    });

    return null;
  }

  if (order.status === 'confirmed') {
    await markAttempt(attempt._id, {
      status: 'paid_unapplied',
      validationId: input.validationId,
      gatewayStatus: input.gatewayStatus,
      gatewayPayload: input.gatewayPayload,
    });

    return toOrderDto(order);
  }

  const now = new Date();
  const holdActive =
    order.status === 'awaiting_payment' &&
    !order.stockReleasedAt &&
    order.stockHoldExpiresAt &&
    order.stockHoldExpiresAt > now;

  if (!holdActive) {
    await markAttempt(attempt._id, {
      status: 'paid_unapplied',
      validationId: input.validationId,
      gatewayStatus: input.gatewayStatus,
      gatewayPayload: input.gatewayPayload,
    });

    return toOrderDto(order);
  }

  const totals = paymentTotalsForOrder(order);

  const confirmed = await OrderModel.findOneAndUpdate(
    {
      _id: order._id,
      status: 'awaiting_payment',
      stockReleasedAt: null,
      stockHoldExpiresAt: { $gt: now },
    },
    {
      $set: {
        status: 'confirmed',
        amountPaid: totals.amountPaid,
        balanceDue: totals.balanceDue,
        paymentStatus: totals.paymentStatus,
      },
    },
    { new: true },
  );

  if (!confirmed) {
    await markAttempt(attempt._id, {
      status: 'paid_unapplied',
      validationId: input.validationId,
      gatewayStatus: input.gatewayStatus,
      gatewayPayload: input.gatewayPayload,
    });

    const latest = await OrderModel.findById(order._id);

    return latest ? toOrderDto(latest) : null;
  }

  await markAttempt(attempt._id, {
    status: 'succeeded',
    validationId: input.validationId,
    gatewayStatus: input.gatewayStatus,
    gatewayPayload: input.gatewayPayload,
  });

  await fulfillmentService.bootstrapForOrder(confirmed._id);

  return toOrderDto(confirmed);
};

export const settleFromGatewayValidation = async (
  validationId: string,
  tranId: string,
  source: 'ipn' | 'redirect',
) => {
  const validated = await validateSslcommerzPayment(validationId);

  if (validated.tranId !== tranId) {
    throw AppError.validation('Payment transaction id does not match');
  }

  return settlePayment({
    tranId: validated.tranId,
    validationId: validated.validationId,
    gatewayStatus: validated.status,
    amount: validated.amount,
    currency: validated.currency,
    gatewayPayload: validated.raw,
    source,
  });
};

export const settleMockPayment = async (attemptId: string) => {
  const attempt = await PaymentAttemptModel.findById(attemptId);

  if (!attempt) {
    throw AppError.notFound('Payment attempt not found');
  }

  const validationId = `mock_${attemptId}`;

  return settlePayment({
    tranId: attempt.tranId,
    validationId,
    gatewayStatus: 'VALID',
    amount: attempt.amount,
    currency: attempt.currency,
    gatewayPayload: { mode: 'mock', attemptId },
    source: 'mock',
  });
};

export const markAttemptCancelled = async (
  tranId: string,
  gatewayPayload: Record<string, unknown>,
) => {
  await PaymentAttemptModel.updateOne(
    { tranId, status: 'pending' },
    { $set: { status: 'cancelled', gatewayPayload } },
  );
};

export const markAttemptFailed = async (
  tranId: string,
  gatewayPayload: Record<string, unknown>,
) => {
  await PaymentAttemptModel.updateOne(
    { tranId, status: 'pending' },
    { $set: { status: 'failed', gatewayPayload } },
  );
};
