import type {
  OrderFulfillmentStatus,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
  VendorOrderStatus,
} from './constants';
import type { OrderItemDto, OrderShippingDto, OrderTotalsDto } from './types';
import type { UserRole } from '../auth/types';

export type VendorOrderDto = {
  id: string;
  parentOrderId: string;
  orderNumber: string;
  vendorOrderNumber: string;
  storeId: string;
  storeName: string;
  status: VendorOrderStatus;
  items: Omit<OrderItemDto, 'storeId' | 'storeName'>[];
  itemsSubtotal: number;
  createdAt: string;
  updatedAt: string;
};

export type VendorOrderSummaryDto = {
  total: number;
  pending: number;
  accepted: number;
  preparing: number;
  readyToShip: number;
  inTransit: number;
  completed: number;
};

export type OrderActivityDto = {
  id: string;
  parentOrderId: string;
  vendorOrderId: string | null;
  actorUserId: string;
  actorRole: UserRole;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AdminOrderListItemDto = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfillmentStatus: OrderFulfillmentStatus;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: OrderPaymentMethod;
  grandTotal: number;
  currency: string;
  vendorOrderCount: number;
  createdAt: string;
};

export type AdminOrderDetailDto = AdminOrderListItemDto & {
  shipping: OrderShippingDto;
  payment: {
    amountPaid: number;
    balanceDue: number;
    codCollectionStatus: string;
  };
  totals: OrderTotalsDto;
  vendorOrders: VendorOrderDto[];
  activity: OrderActivityDto[];
  canCancel: boolean;
};
