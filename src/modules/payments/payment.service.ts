import { Types } from 'mongoose';
import { OrderModel } from '../orders/order.model';
import { PaymentAttemptModel } from './payment-attempt.model';
import { AppError } from '../../common/errors/AppError';
import { runIdempotent } from '../../common/utils/idempotency';
import { IdempotencyScope } from '../orders/constants';
import { assertOrderOwner, customerObjectId, toOrderDto } from '../orders/order.mapper';
import { releaseExpiredOrderHolds } from '../orders/stock';
import type { PaymentPurpose } from './constants';
import { confirmOrderWithNothingDue } from './settle.service';
import {
  buildMockGatewayUrl,
  createSslcommerzSession,
  mockPaymentSignature,
  sslcommerzMode,
  useMockGateway,
} from './sslcommerz.client';
import type { PaymentInitiateDto } from './types';

type Actor = {
  customerId: string;
};

const purposeForMethod = (paymentMethod: string): PaymentPurpose =>
  paymentMethod === 'prepaid' ? 'order_total' : 'delivery_fee';

const nextAttemptNumber = async (orderId: Types.ObjectId) => {
  const latest = await PaymentAttemptModel.findOne({ orderId })
    .sort({ attemptNumber: -1 })
    .select('attemptNumber');

  return (latest?.attemptNumber ?? 0) + 1;
};

export const paymentService = {
  async initiate(
    actor: Actor,
    orderId: string,
    idempotencyKey: string,
  ): Promise<PaymentInitiateDto> {
    await releaseExpiredOrderHolds();

    return runIdempotent({
      customerId: actor.customerId,
      scope: IdempotencyScope.paymentInitiate,
      key: idempotencyKey,
      requestBody: { orderId },
      handler: async () => {
        if (!Types.ObjectId.isValid(orderId)) {
          throw AppError.notFound('Order not found');
        }

        const order = await OrderModel.findById(orderId);

        if (!order) {
          throw AppError.notFound('Order not found');
        }

        assertOrderOwner(order, actor.customerId);

        if (order.status !== 'awaiting_payment') {
          throw AppError.validation('This order is no longer awaiting payment');
        }

        if (order.stockReleasedAt) {
          throw AppError.validation('The payment window for this order has expired');
        }

        const now = new Date();

        if (!order.stockHoldExpiresAt || order.stockHoldExpiresAt <= now) {
          throw AppError.validation('The payment window for this order has expired');
        }

        if (order.amountDueNow <= 0) {
          await confirmOrderWithNothingDue(order);

          const body: PaymentInitiateDto = {
            attemptId: '',
            tranId: '',
            orderId: String(order._id),
            amount: 0,
            currency: order.currency,
            purpose: purposeForMethod(order.paymentMethod),
            gatewayPageUrl: '',
            mode: sslcommerzMode(),
          };

          return { statusCode: 200, body };
        }

        await PaymentAttemptModel.updateMany(
          { orderId: order._id, status: 'pending' },
          { $set: { status: 'superseded' } },
        );

        const attemptNumber = await nextAttemptNumber(order._id);
        const tranId = `${order.orderNumber}-${attemptNumber}`;
        const purpose = purposeForMethod(order.paymentMethod);
        const mode = sslcommerzMode();

        let gatewayPageUrl = '';
        let sessionKey = '';
        let mockSignature = '';

        if (useMockGateway()) {
          const attempt = await PaymentAttemptModel.create({
            orderId: order._id,
            customerId: customerObjectId(actor.customerId),
            purpose,
            tranId,
            attemptNumber,
            amount: order.amountDueNow,
            currency: order.currency,
            status: 'pending',
            mockSignature: '',
          });

          mockSignature = mockPaymentSignature(String(attempt._id));
          gatewayPageUrl = buildMockGatewayUrl(String(attempt._id));

          await PaymentAttemptModel.updateOne({ _id: attempt._id }, { $set: { mockSignature } });

          const body: PaymentInitiateDto = {
            attemptId: String(attempt._id),
            tranId,
            orderId: String(order._id),
            amount: order.amountDueNow,
            currency: order.currency,
            purpose,
            gatewayPageUrl,
            mode,
          };

          return { statusCode: 201, body };
        }

        const session = await createSslcommerzSession({
          tranId,
          orderId: String(order._id),
          amount: order.amountDueNow,
          currency: order.currency,
          customerName: order.shipping.recipientName,
          customerPhone: order.shipping.phone,
          customerAddress: order.shipping.line1,
          customerCity: order.shipping.city,
          customerCountry: order.shipping.country,
        });

        gatewayPageUrl = session.gatewayPageUrl;
        sessionKey = session.sessionKey;

        const attempt = await PaymentAttemptModel.create({
          orderId: order._id,
          customerId: customerObjectId(actor.customerId),
          purpose,
          tranId,
          attemptNumber,
          amount: order.amountDueNow,
          currency: order.currency,
          status: 'pending',
          sessionKey,
        });

        const body: PaymentInitiateDto = {
          attemptId: String(attempt._id),
          tranId,
          orderId: String(order._id),
          amount: order.amountDueNow,
          currency: order.currency,
          purpose,
          gatewayPageUrl,
          mode,
        };

        return { statusCode: 201, body };
      },
    });
  },

  async getOrderAfterPayment(orderId: string) {
    const order = await OrderModel.findById(orderId);

    if (!order) {
      throw AppError.notFound('Order not found');
    }

    return toOrderDto(order);
  },
};
