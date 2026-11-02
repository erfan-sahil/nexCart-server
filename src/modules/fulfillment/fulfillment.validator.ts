import { z } from 'zod';
import {
  FULFILLMENT_REJECTION_REASONS,
  VENDOR_FULFILLMENT_SORTS,
  VENDOR_FULFILLMENT_STATUSES,
} from './constants';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const fulfillmentItemQuantitySchema = z.object({
  variantId: objectIdSchema,
  quantity: z.coerce.number().int().min(0),
});

export const listVendorFulfillmentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(VENDOR_FULFILLMENT_STATUSES).optional(),
  sort: z.enum(VENDOR_FULFILLMENT_SORTS).default('-createdAt'),
});

export const fulfillmentIdParamsSchema = z.object({
  fulfillmentId: objectIdSchema,
});

export const dispatchFulfillmentSchema = z.object({
  inboundCarrier: z.string().trim().min(1).max(80),
  inboundTracking: z.string().trim().min(1).max(80),
});

export const receiveFulfillmentSchema = z.object({
  items: z.array(fulfillmentItemQuantitySchema).min(1),
});

export const inspectFulfillmentSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: objectIdSchema,
        quantityAccepted: z.coerce.number().int().min(0),
        quantityRejected: z.coerce.number().int().min(0),
        rejectionReason: z.enum(FULFILLMENT_REJECTION_REASONS).optional(),
        rejectionNote: z.string().trim().max(300).optional(),
      }),
    )
    .min(1),
});

export const listAdminFulfillmentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(VENDOR_FULFILLMENT_STATUSES).optional(),
  orderNumber: z.string().trim().max(32).optional(),
});

export const orderIdParamsSchema = z.object({
  orderId: objectIdSchema,
});

export const shipOrderSchema = z.object({
  carrier: z.string().trim().min(1).max(80),
  trackingNumber: z.string().trim().min(1).max(80),
});

export const deliverOrderSchema = z.object({}).default({});

export const codCollectionSchema = z.object({
  amountCollected: z.coerce.number().min(0).optional(),
  note: z.string().trim().max(500).optional(),
});

export type ListAdminFulfillmentsQuery = z.infer<typeof listAdminFulfillmentsQuerySchema>;
export type ListVendorFulfillmentsQuery = z.infer<typeof listVendorFulfillmentsQuerySchema>;
export type DispatchFulfillmentInput = z.infer<typeof dispatchFulfillmentSchema>;
export type ReceiveFulfillmentInput = z.infer<typeof receiveFulfillmentSchema>;
export type InspectFulfillmentInput = z.infer<typeof inspectFulfillmentSchema>;
export type ShipOrderInput = z.infer<typeof shipOrderSchema>;
