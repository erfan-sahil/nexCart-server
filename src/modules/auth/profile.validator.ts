import { z } from 'zod';

const nameSchema = z.string().trim().min(1).max(50);

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in international format, for example +8801712345678');

export type UpdateProfileInput = {
  firstName: string;
  lastName: string;
  phone?: string;
};

export const profileUpdateSchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    phone: phoneSchema.or(z.literal('')).optional(),
  })
  .strict();
