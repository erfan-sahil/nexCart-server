import { z } from 'zod';

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);

export const listReturnsQuerySchema = z.object({ page, limit });

export const returnIdParamsSchema = z.object({
  returnId: z.string().min(1),
});

export type ListReturnsQuery = z.infer<typeof listReturnsQuerySchema>;
