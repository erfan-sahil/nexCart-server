import { z } from 'zod';
import { VENDOR_RETURN_SHIPMENT_STATUSES } from './vendor-return-shipment.model';

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);

export const listVendorReturnShipmentsQuerySchema = z.object({
  page,
  limit,
  status: z.enum(VENDOR_RETURN_SHIPMENT_STATUSES).optional(),
  storeId: z.string().min(1).optional(),
  parentOrderId: z.string().min(1).optional(),
});

export const vendorReturnShipmentIdParamsSchema = z.object({
  shipmentId: z.string().min(1),
});

export const dispatchVendorReturnShipmentBodySchema = z.object({
  carrier: z.string().trim().max(80).optional(),
  trackingNumber: z.string().trim().max(120).optional(),
});

export type ListVendorReturnShipmentsQuery = z.infer<typeof listVendorReturnShipmentsQuerySchema>;
export type DispatchVendorReturnShipmentBody = z.infer<
  typeof dispatchVendorReturnShipmentBodySchema
>;
