import { Types } from 'mongoose';
import type { Order } from '../../models/order.model';
import type { Product } from '../../models/product.model';
import type { Shipment } from '../../models/shipment.model';
import { AppError } from '../../utils/AppError';
import type { OrderDto, OrderShippingDto, OrderTrackingDto } from './types';

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

const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;

const productImageUrl = (product: Pick<Product, 'thumbnailId' | 'images'> | undefined) => {
  if (!product) {
    return '';
  }

  const thumbnail = product.images.find((image) => image.imageId === product.thumbnailId);

  return thumbnail?.url ?? product.images[0]?.url ?? '';
};

export const toOrderTrackingDto = (
  order: Order,
  shipment: Shipment | null,
  products: Map<string, Pick<Product, 'slug' | 'thumbnailId' | 'images'>>,
): OrderTrackingDto => ({
  orderNumber: order.orderNumber,
  status: order.status,
  paymentMethod: order.paymentMethod,
  paymentStatus: order.paymentStatus,
  placedAt: order.createdAt.toISOString(),
  shipTo: {
    recipientName: order.shipping.recipientName,
    line1: order.shipping.line1,
    line2: order.shipping.line2 ?? '',
    city: order.shipping.city,
    state: order.shipping.state,
    postalCode: order.shipping.postalCode,
    country: order.shipping.country,
  },
  carrier: shipment?.carrier ?? '',
  trackingNumber: shipment?.trackingNumber ?? '',
  packedAt: iso(shipment?.packedAt),
  shippedAt: iso(shipment?.shippedAt),
  deliveredAt: iso(shipment?.deliveredAt),
  fulfillmentStartedAt: iso(shipment?.createdAt),
  grandTotal: order.grandTotal,
  currency: order.currency,
  items: order.items.map((item) => {
    const product = products.get(String(item.productId));

    return {
      name: item.productName,
      slug: product?.slug ?? '',
      imageUrl: productImageUrl(product),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    };
  }),
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
