import { z } from 'zod';
import {
  COUPON_CODE_MAX_LENGTH,
  COUPON_DISCOUNT_TYPES,
  COUPON_LABEL_MAX_LENGTH,
} from './constants';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const couponCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(COUPON_CODE_MAX_LENGTH)
  .transform((value) => value.toUpperCase());

const discountValueSchema = z.coerce.number().positive();

const couponBodyBase = {
  code: couponCodeSchema,
  label: z.string().trim().max(COUPON_LABEL_MAX_LENGTH).optional().default(''),
  discountType: z.enum(COUPON_DISCOUNT_TYPES),
  discountValue: discountValueSchema,
  minimumSubtotal: z.coerce.number().min(0).optional().default(0),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  usageLimit: z
    .union([z.coerce.number().int().min(1), z.null()])
    .optional()
    .default(null),
  perCustomerLimit: z.coerce.number().int().min(1).optional().default(1),
  isEnabled: z.boolean().optional().default(true),
};

const assertDiscountBounds = (
  discountType: (typeof COUPON_DISCOUNT_TYPES)[number],
  discountValue: number,
  ctx: z.RefinementCtx,
) => {
  if (discountType === 'percent' && discountValue > 100) {
    ctx.addIssue({
      code: 'custom',
      path: ['discountValue'],
      message: 'Percent discount cannot exceed 100',
    });
  }
};

const assertDateRange = (startsAt: Date, endsAt: Date, ctx: z.RefinementCtx) => {
  if (endsAt <= startsAt) {
    ctx.addIssue({
      code: 'custom',
      path: ['endsAt'],
      message: 'End time must be after start time',
    });
  }
};

export const createCouponSchema = z.object(couponBodyBase).superRefine((value, ctx) => {
  assertDiscountBounds(value.discountType, value.discountValue, ctx);
  assertDateRange(value.startsAt, value.endsAt, ctx);
});

export const updateCouponSchema = z
  .object({
    code: couponCodeSchema.optional(),
    label: z.string().trim().max(COUPON_LABEL_MAX_LENGTH).optional(),
    discountType: z.enum(COUPON_DISCOUNT_TYPES).optional(),
    discountValue: discountValueSchema.optional(),
    minimumSubtotal: z.coerce.number().min(0).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    usageLimit: z.union([z.coerce.number().int().min(1), z.null()]).optional(),
    perCustomerLimit: z.coerce.number().int().min(1).optional(),
    isEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  })
  .superRefine((value, ctx) => {
    if (value.discountType && value.discountValue !== undefined) {
      assertDiscountBounds(value.discountType, value.discountValue, ctx);
    } else if (value.discountType === 'percent' && value.discountValue === undefined) {
      // percent cap checked in service when both present
    }

    if (value.startsAt && value.endsAt) {
      assertDateRange(value.startsAt, value.endsAt, ctx);
    }
  });

export const couponIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const setCouponEnabledSchema = z.object({
  isEnabled: z.boolean(),
});

export const listCouponsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  enabled: z.enum(['all', 'enabled', 'disabled']).default('all'),
  search: z.string().trim().max(COUPON_CODE_MAX_LENGTH).optional(),
});

export const checkoutCouponCodeSchema = z
  .string()
  .trim()
  .max(COUPON_CODE_MAX_LENGTH)
  .transform((value) => value.toUpperCase())
  .optional();

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
export type SetCouponEnabledInput = z.infer<typeof setCouponEnabledSchema>;
export type ListCouponsQuery = z.infer<typeof listCouponsQuerySchema>;
