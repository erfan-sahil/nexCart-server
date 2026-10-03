import { z } from 'zod';
import { USER_ROLES } from '../constants/auth';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const userIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const updateUserRoleSchema = z
  .object({
    role: z.enum(USER_ROLES),
  })
  .strict();

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
