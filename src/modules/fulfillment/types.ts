import type { ShipmentStatus, VendorFulfillmentStatus } from './constants';

export type FulfillmentItemDto = {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityAccepted: number;
  quantityRejected: number;
};

export type VendorFulfillmentDto = {
  id: string;
  orderId: string;
  orderNumber: string;
  storeId: string;
  storeName: string;
  status: VendorFulfillmentStatus;
  items: FulfillmentItemDto[];
  itemsSubtotal: number;
  hasDiscrepancy: boolean;
  inboundCarrier: string;
  inboundTracking: string;
  dispatchedAt: string | null;
  receivedAt: string | null;
  inspectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ShipmentDto = {
  id: string;
  orderId: string;
  orderNumber: string;
  status: ShipmentStatus;
  carrier: string;
  trackingNumber: string;
  packedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderFulfillmentSummaryDto = {
  shipment: ShipmentDto | null;
  vendorFulfillments: VendorFulfillmentDto[];
};
