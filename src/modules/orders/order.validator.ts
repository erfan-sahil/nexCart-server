import { z } from 'zod';
import { ORDER_PAYMENT_METHODS, MAX_ORDER_LINES, MAX_ORDER_LINE_QUANTITY } from './constants';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const orderLineSchema = z.object({
  variantId: objectIdSchema,
  quantity: z.coerce.number().int().min(1).max(MAX_ORDER_LINE_QUANTITY),
});

const shippingSchema = z.object({
  recipientName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(20),
  line1: z.string().trim().min(1).max(160),
  line2: z.string().trim().max(160).optional().default(''),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  postalCode: z.string().trim().min(1).max(20),
  country: z.string().trim().min(1).max(80),
});

const checkoutBodySchema = z.object({
  paymentMethod: z.enum(ORDER_PAYMENT_METHODS),
  items: z.array(orderLineSchema).min(1).max(MAX_ORDER_LINES),
  shipping: shippingSchema,
  note: z.string().trim().max(500).optional(),
});

export const quoteOrderSchema = checkoutBodySchema;

export const createOrderSchema = checkoutBodySchema;

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const orderIdParamsSchema = z.object({
  orderId: objectIdSchema,
});

export const trackOrderSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .min(4)
    .max(32)
    .transform((value) => value.toUpperCase()),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address')),
});

export type QuoteOrderInput = z.infer<typeof quoteOrderSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type TrackOrderInput = z.infer<typeof trackOrderSchema>;
