import { z } from 'zod';
import { MAX_DELIVERY_FEE, MAX_FREE_DELIVERY_AMOUNT } from './constants';

const hasAtMostTwoDecimals = (value: number) =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

const moneyAmount = (label: string, max: number) =>
  z
    .number()
    .finite(`${label} must be a number`)
    .min(0, `${label} cannot be negative`)
    .max(max, `${label} is too large`)
    .refine(hasAtMostTwoDecimals, `${label} can have at most 2 decimal places`);

export const updateSiteSettingsSchema = z
  .object({
    deliveryFee: moneyAmount('Delivery fee', MAX_DELIVERY_FEE),
    freeDeliveryEnabled: z.boolean(),
    freeDeliveryMinAmount: moneyAmount('Free delivery amount', MAX_FREE_DELIVERY_AMOUNT),
  })
  .superRefine((value, context) => {
    if (value.freeDeliveryEnabled && value.freeDeliveryMinAmount <= 0) {
      context.addIssue({
        code: 'custom',
        path: ['freeDeliveryMinAmount'],
        message: 'Enter the order amount that unlocks free delivery',
      });
    }
  });

export type UpdateSiteSettingsInput = z.infer<typeof updateSiteSettingsSchema>;
