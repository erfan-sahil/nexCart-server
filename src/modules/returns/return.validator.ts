import { z } from 'zod';
import { RETURN_KINDS, RETURN_STATUSES } from './return-request.model';

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);

export const listReturnsQuerySchema = z.object({
  page,
  limit,
  status: z.enum(RETURN_STATUSES).optional(),
  kind: z.enum(RETURN_KINDS).optional(),
  parentOrderId: z.string().min(1).optional(),
});

export const returnIdParamsSchema = z.object({
  returnId: z.string().min(1),
});

export const inspectReturnBodySchema = z.object({
  lines: z
    .array(
      z.object({
        variantId: z.string().min(1),
        disposition: z.enum(['sellable', 'damaged']),
      }),
    )
    .min(1),
});

export const resolveReturnBodySchema = z.object({
  action: z.enum(['refund_without_restock', 'close_without_refund']),
  note: z.string().trim().max(500).optional(),
});

export type ListReturnsQuery = z.infer<typeof listReturnsQuerySchema>;
export type InspectReturnBody = z.infer<typeof inspectReturnBodySchema>;
export type ResolveReturnBody = z.infer<typeof resolveReturnBodySchema>;
