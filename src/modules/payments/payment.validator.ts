import { z } from 'zod';

export const initiatePaymentBodySchema = z.object({}).default({});

export type InitiatePaymentBody = z.infer<typeof initiatePaymentBodySchema>;
