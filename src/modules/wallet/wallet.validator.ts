import { z } from 'zod';

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);

export const listWalletTransactionsQuerySchema = z.object({
  page,
  limit,
});

export const updateCommissionSettingsSchema = z.object({
  defaultCommissionRate: z.number().min(0).max(100),
  settlementHoldDays: z.number().int().min(0).max(90),
});

export const storeCommissionParamsSchema = z.object({
  storeId: z.string().min(1),
});

export const storeCommissionBodySchema = z.object({
  commissionRate: z.number().min(0).max(100).nullable(),
});

export const releaseStoreSettlementBodySchema = z.object({
  force: z.boolean().optional().default(false),
  amount: z.number().positive().max(100_000_000).optional(),
  note: z.string().trim().max(500).optional(),
});

export const listVendorEarningsQuerySchema = z.object({
  page,
  limit,
});

export type ListWalletTransactionsQuery = z.infer<typeof listWalletTransactionsQuerySchema>;
export type UpdateCommissionSettingsInput = z.infer<typeof updateCommissionSettingsSchema>;
export type StoreCommissionBody = z.infer<typeof storeCommissionBodySchema>;
export type ReleaseStoreSettlementBody = z.infer<typeof releaseStoreSettlementBodySchema>;
export type ListVendorEarningsQuery = z.infer<typeof listVendorEarningsQuerySchema>;
