import { Types } from 'mongoose';
import { AppError } from '../../common/errors/AppError';
import { OrderModel } from './order.model';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const assertCodOrder = async (orderId: string) => {
  if (!Types.ObjectId.isValid(orderId)) {
    throw AppError.notFound('Order not found');
  }

  const order = await OrderModel.findById(orderId);

  if (!order || order.status !== 'delivered') {
    throw AppError.validation('Order must be delivered');
  }

  if (order.paymentMethod !== 'cod') {
    throw AppError.validation('Cash-on-delivery actions apply only to COD orders');
  }

  return order;
};

export const codService = {
  async recordCollection(
    orderId: string,
    input: { amountCollected: number; courierReference?: string },
  ) {
    const order = await assertCodOrder(orderId);

    if (
      ['collected', 'remitted', 'reconciled'].includes(order.codRemittanceStatus) &&
      order.codCollectedAmount !== null
    ) {
      return {
        orderId: String(order._id),
        codExpectedAmount: money(order.codExpectedAmount ?? 0),
        codCollectedAmount: money(order.codCollectedAmount ?? 0),
        codRemittanceStatus: order.codRemittanceStatus,
      };
    }

    const collected = money(input.amountCollected);
    const expected = money(order.codExpectedAmount ?? order.balanceDue);

    order.codCollectedAmount = collected;
    order.codCourierReference = input.courierReference?.trim() ?? '';
    order.codRemittanceStatus = collected >= expected ? 'collected' : 'short';
    order.codCollectionStatus = 'collected';
    await order.save();

    return {
      orderId: String(order._id),
      codExpectedAmount: expected,
      codCollectedAmount: collected,
      codRemittanceStatus: order.codRemittanceStatus,
    };
  },

  async recordRemittance(orderId: string, input: { remittedAmount: number }) {
    const order = await assertCodOrder(orderId);

    if (order.codRemittanceStatus === 'reconciled' && order.codRemittedAmount !== null) {
      return {
        orderId: String(order._id),
        codRemittedAmount: money(order.codRemittedAmount ?? 0),
        codRemittanceStatus: order.codRemittanceStatus,
      };
    }

    if (order.codRemittanceStatus === 'remitted' && order.codRemittedAmount !== null) {
      return {
        orderId: String(order._id),
        codRemittedAmount: money(order.codRemittedAmount ?? 0),
        codRemittanceStatus: order.codRemittanceStatus,
      };
    }

    const remitted = money(input.remittedAmount);

    order.codRemittedAmount = remitted;
    order.codRemittanceStatus = 'remitted';
    await order.save();

    return {
      orderId: String(order._id),
      codRemittedAmount: remitted,
      codRemittanceStatus: order.codRemittanceStatus,
    };
  },

  async reconcile(orderId: string) {
    const order = await assertCodOrder(orderId);

    if (order.codRemittanceStatus === 'reconciled') {
      return {
        orderId: String(order._id),
        paymentStatus: order.paymentStatus,
        codRemittanceStatus: order.codRemittanceStatus,
        balanceDue: order.balanceDue,
      };
    }

    const expected = money(order.codExpectedAmount ?? 0);
    const remitted = money(order.codRemittedAmount ?? 0);

    if (remitted !== expected) {
      throw AppError.validation('Remitted amount must equal expected COD amount');
    }

    order.codRemittanceStatus = 'reconciled';
    order.paymentStatus = 'paid';
    order.balanceDue = 0;
    order.amountPaid = money(order.amountPaid + expected);
    await order.save();

    return {
      orderId: String(order._id),
      paymentStatus: order.paymentStatus,
      codRemittanceStatus: order.codRemittanceStatus,
      balanceDue: order.balanceDue,
    };
  },
};
