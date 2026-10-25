import { z } from 'zod';
import { USER_ROLES, USER_STATUSES } from '../constants/auth';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address'));

const nameSchema = z.string().trim().min(1).max(50);

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in international format, for example +8801712345678');

const blankToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const listUsersQuerySchema = z.object({
  id: z.preprocess(blankToUndefined, objectIdSchema.optional()),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.preprocess(blankToUndefined, z.enum(USER_ROLES).optional()),
  status: z.preprocess(blankToUndefined, z.enum(USER_STATUSES).optional()),
  search: z.preprocess(blankToUndefined, z.string().trim().min(1).max(80).optional()),
  sort: z
    .enum([
      'createdAt',
      '-createdAt',
      'name',
      '-name',
      'email',
      '-email',
      'lastLoginAt',
      '-lastLoginAt',
    ])
    .default('-createdAt'),
});

export const userIdQuerySchema = z.object({
  id: objectIdSchema,
});

export const updateUserSchema = z
  .object({
    email: emailSchema.optional(),
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    phone: phoneSchema.or(z.literal('')).optional(),
    role: z.enum(USER_ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UserIdQuery = z.infer<typeof userIdQuerySchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
