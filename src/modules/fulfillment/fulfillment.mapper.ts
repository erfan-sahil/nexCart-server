import type { Order } from '../orders/order.model';
import type { Shipment } from './shipment.model';
import type { VendorFulfillment } from './vendor-fulfillment.model';
import type { FulfillmentItemDto, ShipmentDto, VendorFulfillmentDto } from './types';

const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;

const toItemDto = (item: VendorFulfillment['items'][number]): FulfillmentItemDto => ({
  variantId: String(item.variantId),
  productId: String(item.productId),
  productName: item.productName,
  sku: item.sku,
  quantityOrdered: item.quantityOrdered,
  quantityReceived: item.quantityReceived,
  quantityAccepted: item.quantityAccepted,
  quantityRejected: item.quantityRejected,
});

export const toVendorFulfillmentDto = (row: VendorFulfillment): VendorFulfillmentDto => ({
  id: String(row._id),
  orderId: String(row.orderId),
  orderNumber: row.orderNumber,
  storeId: String(row.storeId),
  storeName: row.storeName,
  status: row.status,
  items: row.items.map(toItemDto),
  itemsSubtotal: row.itemsSubtotal,
  hasDiscrepancy: row.hasDiscrepancy,
  inboundCarrier: row.inboundCarrier ?? '',
  inboundTracking: row.inboundTracking ?? '',
  dispatchedAt: iso(row.dispatchedAt),
  receivedAt: iso(row.receivedAt),
  inspectedAt: iso(row.inspectedAt),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const toShipmentDto = (row: Shipment): ShipmentDto => ({
  id: String(row._id),
  orderId: String(row.orderId),
  orderNumber: row.orderNumber,
  status: row.status,
  carrier: row.carrier ?? '',
  trackingNumber: row.trackingNumber ?? '',
  packedAt: iso(row.packedAt),
  shippedAt: iso(row.shippedAt),
  deliveredAt: iso(row.deliveredAt),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export type OrderLineSnapshot = {
  storeId: Order['items'][number]['storeId'];
  productId: Order['items'][number]['productId'];
  variantId: Order['items'][number]['variantId'];
  productName: string;
  storeName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type StoreGroupedItems = {
  storeId: string;
  storeName: string;
  vendorUserId: string;
  itemsSubtotal: number;
  items: OrderLineSnapshot[];
};

export const groupOrderItemsByStore = (
  order: Order,
  storeOwners: Map<string, { userId: string; name: string }>,
): StoreGroupedItems[] => {
  const groups = new Map<string, StoreGroupedItems>();

  for (const item of order.items) {
    const storeId = String(item.storeId);
    const store = storeOwners.get(storeId);

    if (!store) {
      continue;
    }

    const snapshot: OrderLineSnapshot = {
      storeId: item.storeId,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      storeName: item.storeName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    };

    const existing = groups.get(storeId);

    if (existing) {
      existing.items.push(snapshot);
      existing.itemsSubtotal += item.lineTotal;
      continue;
    }

    groups.set(storeId, {
      storeId,
      storeName: store.name,
      vendorUserId: store.userId,
      itemsSubtotal: item.lineTotal,
      items: [snapshot],
    });
  }

  return [...groups.values()];
};
