import { z } from 'zod';

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);

export const createWithdrawalSchema = z.object({
  amount: z.number().positive(),
});

export const withdrawalIdParamsSchema = z.object({
  withdrawalId: z.string().min(1),
});

export const listWithdrawalsQuerySchema = z.object({
  page,
  limit,
  status: z.enum(['pending', 'approved', 'processing', 'paid', 'rejected', 'cancelled']).optional(),
});

export const reviewWithdrawalSchema = z.object({
  action: z.enum(['approve', 'reject', 'processing', 'paid']),
  reviewNote: z.string().max(500).optional(),
  payoutReference: z.string().max(120).optional(),
});

export type CreateWithdrawalInput = z.infer<typeof createWithdrawalSchema>;
export type ListWithdrawalsQuery = z.infer<typeof listWithdrawalsQuerySchema>;
export type ReviewWithdrawalInput = z.infer<typeof reviewWithdrawalSchema>;
