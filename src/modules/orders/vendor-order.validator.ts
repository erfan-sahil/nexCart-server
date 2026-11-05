import { z } from 'zod';
import { FULFILLMENT_REJECTION_REASONS } from '../fulfillment/constants';
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

export const listAdminVendorOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(80).optional(),
  status: z.enum(VENDOR_ORDER_STATUSES).optional(),
  sort: z.enum(['createdAt', '-createdAt', 'updatedAt', '-updatedAt']).default('-updatedAt'),
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

export const updateVendorOrderStatusSchema = z.object({
  status: z.enum([
    'accepted',
    'cancelled',
    'preparing',
    'sending_to_warehouse',
    'received_returned_rejects',
  ]),
});

const inspectLineSchema = z.object({
  variantId: z.string().min(1),
  acceptedQty: z.number().int().min(0),
  rejectedQty: z.number().int().min(0),
  rejectionReason: z.enum(FULFILLMENT_REJECTION_REASONS).optional(),
  rejectionNote: z.string().trim().max(300).optional(),
});

export const updateAdminVendorOrderStatusSchema = z
  .object({
    status: z.enum([
      'received_at_warehouse',
      'inspecting',
      'accepted_at_warehouse',
      'partially_accepted',
      'rejected_at_warehouse',
      'return_rejects_to_vendor',
      'cancelled',
      'adjust_target_qty',
    ]),
    items: z.array(inspectLineSchema).optional(),
    rejectReturnId: z.string().min(1).optional(),
    adjustQuantities: z
      .array(
        z.object({
          variantId: z.string().min(1),
          targetQty: z.number().int().min(0),
        }),
      )
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (
      (value.status === 'accepted_at_warehouse' ||
        value.status === 'partially_accepted' ||
        value.status === 'rejected_at_warehouse') &&
      (!value.items || value.items.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: 'items are required for inspection decision',
      });
    }

    if (value.status === 'return_rejects_to_vendor' && !value.rejectReturnId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rejectReturnId'],
        message: 'rejectReturnId is required',
      });
    }
  });

export const updateAdminOrderStatusSchema = z
  .object({
    status: z.enum([
      'packed',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'delivery_failed',
      'customer_rejected',
      'returning_to_warehouse',
      'returned_to_warehouse',
    ]),
    carrier: z.string().trim().min(1).max(80).optional(),
    trackingNumber: z.string().trim().min(1).max(80).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
    returnId: z.string().min(1).optional(),
    lines: z
      .array(
        z.object({
          variantId: z.string().min(1),
          quantity: z.number().int().min(1),
        }),
      )
      .min(1)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (
      (value.status === 'delivery_failed' || value.status === 'customer_rejected') &&
      !value.reason?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'reason is required',
      });
    }

    if (value.status === 'customer_rejected' && (!value.lines || value.lines.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lines'],
        message: 'lines are required for customer rejection',
      });
    }
  });

export const codCollectionSchema = z.object({
  amountCollected: z.number().min(0),
  courierReference: z.string().max(120).optional(),
});

export const codRemittanceSchema = z.object({
  remittedAmount: z.number().min(0),
});

export type ListVendorOrdersQuery = z.infer<typeof listVendorOrdersQuerySchema>;
export type ListAdminVendorOrdersQuery = z.infer<typeof listAdminVendorOrdersQuerySchema>;
export type ListAdminOrdersQuery = z.infer<typeof listAdminOrdersQuerySchema>;
export type UpdateVendorOrderStatusBody = z.infer<typeof updateVendorOrderStatusSchema>;
export type UpdateAdminVendorOrderStatusBody = z.infer<typeof updateAdminVendorOrderStatusSchema>;
export type UpdateAdminOrderStatusBody = z.infer<typeof updateAdminOrderStatusSchema>;
