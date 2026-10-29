import { Types } from 'mongoose';
import type { Order } from '../../models/order.model';
import { AppError } from '../../utils/AppError';
import type { OrderDto, OrderShippingDto } from './types';

const toShippingDto = (shipping: Order['shipping']): OrderShippingDto => ({
  recipientName: shipping.recipientName,
  phone: shipping.phone,
  line1: shipping.line1,
  line2: shipping.line2 ?? '',
  city: shipping.city,
  state: shipping.state,
  postalCode: shipping.postalCode,
  country: shipping.country,
});

export const toOrderDto = (order: Order): OrderDto => ({
  id: String(order._id),
  orderNumber: order.orderNumber,
  paymentMethod: order.paymentMethod,
  status: order.status,
  paymentStatus: order.paymentStatus,
  codCollectionStatus: order.codCollectionStatus,
  shipping: toShippingDto(order.shipping),
  note: order.note ?? '',
  items: order.items.map((item) => ({
    variantId: String(item.variantId),
    productId: String(item.productId),
    storeId: String(item.storeId),
    productName: item.productName,
    storeName: item.storeName,
    sku: item.sku,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  })),
  totals: {
    itemsSubtotal: order.itemsSubtotal,
    deliveryFee: order.deliveryFee,
    grandTotal: order.grandTotal,
    amountDueNow: order.amountDueNow,
    amountPaid: order.amountPaid,
    balanceDue: order.balanceDue,
    refundableAmount: order.refundableAmount,
    currency: order.currency,
  },
  stockHoldExpiresAt: order.stockHoldExpiresAt?.toISOString() ?? null,
  createdAt: order.createdAt.toISOString(),
  updatedAt: order.updatedAt.toISOString(),
});

export const assertOrderOwner = (order: Order, customerId: string) => {
  if (String(order.customerId) !== customerId) {
    throw AppError.notFound('Order not found');
  }
};

export const customerObjectId = (customerId: string) => {
  if (!Types.ObjectId.isValid(customerId)) {
    throw AppError.unauthorized();
  }

  return new Types.ObjectId(customerId);
};
