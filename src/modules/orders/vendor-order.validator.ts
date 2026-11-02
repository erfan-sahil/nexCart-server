import { z } from 'zod';
import { VENDOR_ORDER_STATUSES } from './constants';

export const listVendorOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(VENDOR_ORDER_STATUSES).optional(),
  sort: z.enum(['createdAt', '-createdAt', 'updatedAt', '-updatedAt']).default('-createdAt'),
});

export const vendorOrderIdParamsSchema = z.object({
  vendorOrderId: z.string().min(1),
});

export const listAdminOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(80).optional(),
  fulfillmentStatus: z.string().trim().max(40).optional(),
  paymentStatus: z.string().trim().max(40).optional(),
  sort: z.enum(['createdAt', '-createdAt']).default('-createdAt'),
});

export const adminOrderIdParamsSchema = z.object({
  orderId: z.string().min(1),
});

export type ListVendorOrdersQuery = z.infer<typeof listVendorOrdersQuerySchema>;
export type ListAdminOrdersQuery = z.infer<typeof listAdminOrdersQuerySchema>;
