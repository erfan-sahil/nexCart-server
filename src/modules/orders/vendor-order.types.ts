import type {
  OrderFulfillmentStatus,
  OrderPaymentMethod,
  OrderPaymentStatus,
  VendorOrderStatus,
} from './constants';
import type {
  OrderCustomerFacingStatus,
  OrderItemDto,
  OrderShippingDto,
  OrderTotalsDto,
} from './types';
import type { UserRole } from '../auth/types';

export type InboundBatchLineDto = {
  variantId: string;
  sku: string;
  productName: string;
  sentQty: number;
  acceptedQty: number;
  rejectedQty: number;
  rejectionReason: string | null;
  rejectionNote: string;
};

export type InboundBatchDto = {
  id: string;
  sequence: number;
  status: string;
  lines: InboundBatchLineDto[];
  dispatchedAt: string;
  receivedAt: string | null;
  inspectedAt: string | null;
};

export type RejectReturnLineDto = {
  variantId: string;
  sku: string;
  quantity: number;
  rejectionReason: string;
  rejectionNote: string;
};

export type RejectReturnDto = {
  id: string;
  inboundBatchId: string;
  status: string;
  lines: RejectReturnLineDto[];
  sentToVendorAt: string | null;
  receivedByVendorAt: string | null;
};

export type AdminShipmentDto = {
  status: string;
  carrier: string;
  trackingNumber: string;
  packedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
};

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

export type AdminVendorOrderDto = VendorOrderDto & {
  inboundBatches: InboundBatchDto[];
  rejectReturns: RejectReturnDto[];
};

export type VendorOrderSummaryDto = {
  total: number;
  pending: number;
  accepted: number;
  preparing: number;
  sendingToWarehouse: number;
  receivedAtWarehouse: number;
  inspecting: number;
  acceptedAtWarehouse: number;
  partiallyAccepted: number;
  rejectedAtWarehouse: number;
  packed: number;
  shipped: number;
  outForDelivery: number;
  delivered: number;
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
  status: OrderCustomerFacingStatus;
  fulfillmentStatus: OrderFulfillmentStatus;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: OrderPaymentMethod;
  grandTotal: number;
  currency: string;
  vendorOrderCount: number;
  createdAt: string;
};

export type AdminDeliveryReturnDto = {
  id: string;
  kind: string;
  status: string;
  reason: string;
  refundAmount: number | null;
  cashRefundAmount: number;
  balanceWaivedAmount: number;
  deliveryFeeRefund: number;
  lines: Array<{
    variantId: string;
    productName: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    disposition: string;
  }>;
  createdAt: string;
};

export type AdminOrderDetailDto = AdminOrderListItemDto & {
  shipping: OrderShippingDto;
  payment: {
    amountPaid: number;
    amountRefunded: number;
    balanceDue: number;
    refundableAmount: number;
    codCollectionStatus: string;
  };
  totals: OrderTotalsDto;
  shipment: AdminShipmentDto | null;
  returns: AdminDeliveryReturnDto[];
  vendorOrders: AdminVendorOrderDto[];
  activity: OrderActivityDto[];
  canCancel: boolean;
};
