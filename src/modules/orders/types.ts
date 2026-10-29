import type {
  CodCollectionStatus,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
} from './constants';

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
};

export type OrderTotalsDto = {
  itemsSubtotal: number;
  deliveryFee: number;
  grandTotal: number;
  amountDueNow: number;
  amountPaid: number;
  balanceDue: number;
  refundableAmount: number;
  currency: string;
};

export type OrderDto = {
  id: string;
  orderNumber: string;
  paymentMethod: OrderPaymentMethod;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  codCollectionStatus: CodCollectionStatus;
  shipping: OrderShippingDto;
  note: string;
  items: OrderItemDto[];
  totals: OrderTotalsDto;
  stockHoldExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderQuoteDto = {
  paymentMethod: OrderPaymentMethod;
  items: OrderItemDto[];
  totals: OrderTotalsDto;
};
