import type {
  CodCollectionStatus,
  CustomerOrderStatus,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
} from './constants';

/** Status shown on customer/admin lists when warehouse steps are projected away. */
export type OrderCustomerFacingStatus = OrderStatus | CustomerOrderStatus;
import type { CustomerTimelineStep } from './order-timeline';

export type OrderShippingDto = {
  recipientName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type OrderItemDto = {
  variantId: string;
  productId: string;
  storeId: string;
  productName: string;
  storeName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string;
};

export type OrderTotalsDto = {
  itemsSubtotal: number;
  couponCode: string | null;
  couponDiscount: number;
  deliveryFee: number;
  grandTotal: number;
  amountDueNow: number;
  amountPaid: number;
  amountRefunded: number;
  balanceDue: number;
  refundableAmount: number;
  currency: string;
};

export type OrderDeliveryOutcome =
  | null
  | 'out_for_delivery'
  | 'delivered'
  | 'delivery_failed'
  | 'customer_rejected'
  | 'returning_to_warehouse'
  | 'returned_to_warehouse';

export type OrderDto = {
  id: string;
  orderNumber: string;
  paymentMethod: OrderPaymentMethod;
  status: OrderCustomerFacingStatus;
  paymentStatus: OrderPaymentStatus;
  codCollectionStatus: CodCollectionStatus;
  shipping: OrderShippingDto;
  note: string;
  items: OrderItemDto[];
  totals: OrderTotalsDto;
  deliveryOutcome: OrderDeliveryOutcome;
  refundStatus: string | null;
  stockHoldExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderQuoteDto = {
  paymentMethod: OrderPaymentMethod;
  items: OrderItemDto[];
  totals: OrderTotalsDto;
};

export type OrderTrackingItemDto = {
  name: string;
  slug: string;
  imageUrl: string;
  quantity: number;
  unitPrice: number;
};

export type OrderTrackingDto = {
  orderNumber: string;
  status: OrderCustomerFacingStatus;
  paymentMethod: OrderPaymentMethod;
  paymentStatus: OrderPaymentStatus;
  placedAt: string;
  shipTo: Omit<OrderShippingDto, 'phone'>;
  carrier: string;
  trackingNumber: string;
  packedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  fulfillmentStartedAt: string | null;
  timeline: CustomerTimelineStep[];
  deliveryOutcome: OrderDeliveryOutcome;
  refundStatus: string | null;
  grandTotal: number;
  currency: string;
  amountRefunded: number;
  items: OrderTrackingItemDto[];
};
