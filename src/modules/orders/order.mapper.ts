import { Types } from 'mongoose';
import type { Order } from './order.model';
import type { Product } from '../products/product.model';
import type { Shipment } from '../fulfillment/shipment.model';
import type { VendorFulfillment } from '../fulfillment/vendor-fulfillment.model';
import { AppError } from '../../common/errors/AppError';
import type { OrderDto, OrderShippingDto, OrderTrackingDto } from './types';
import { projectCustomerStatusWithVendorOrders } from './customer-order-status.service';
import type { VendorOrder } from './vendor-order.model';
import { projectCustomerStatus } from './order-status';
import { projectCustomerTimeline } from './order-timeline';

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

const toDeliveryOutcome = (shipmentStatus?: string | null) => {
  if (!shipmentStatus) {
    return null;
  }

  if (
    [
      'out_for_delivery',
      'delivered',
      'delivery_failed',
      'customer_rejected',
      'returning_to_warehouse',
      'returned_to_warehouse',
    ].includes(shipmentStatus)
  ) {
    return shipmentStatus as NonNullable<OrderDto['deliveryOutcome']>;
  }

  return null;
};

export const toOrderDto = (
  order: Order,
  vendorOrders?: Pick<VendorOrder, 'status'>[],
  shipmentStatus?: string | null,
  refundStatus?: string | null,
): OrderDto => ({
  id: String(order._id),
  orderNumber: order.orderNumber,
  paymentMethod: order.paymentMethod,
  status: vendorOrders
    ? projectCustomerStatusWithVendorOrders(order, vendorOrders, shipmentStatus, refundStatus)
    : projectCustomerStatus(order),
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
    couponCode: order.couponCode ?? null,
    couponDiscount: order.couponDiscount ?? 0,
    deliveryFee: order.deliveryFee,
    grandTotal: order.grandTotal,
    amountDueNow: order.amountDueNow,
    amountPaid: order.amountPaid,
    amountRefunded: order.amountRefunded ?? 0,
    balanceDue: order.balanceDue,
    refundableAmount: order.refundableAmount,
    currency: order.currency,
  },
  deliveryOutcome: toDeliveryOutcome(shipmentStatus),
  refundStatus: refundStatus ?? null,
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
  fulfillments: VendorFulfillment[],
  products: Map<string, Pick<Product, 'slug' | 'thumbnailId' | 'images'>>,
  vendorOrders?: Pick<VendorOrder, 'status'>[],
  refundStatus?: string | null,
): OrderTrackingDto => ({
  orderNumber: order.orderNumber,
  status: vendorOrders
    ? projectCustomerStatusWithVendorOrders(
        order,
        vendorOrders,
        shipment?.status ?? null,
        refundStatus,
      )
    : projectCustomerStatus(order),
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
  timeline: projectCustomerTimeline({ order, shipment, vendorOrders, refundStatus }),
  deliveryOutcome: toDeliveryOutcome(shipment?.status ?? null),
  refundStatus: refundStatus ?? null,
  grandTotal: order.grandTotal,
  currency: order.currency,
  amountRefunded: order.amountRefunded ?? 0,
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
