import { z } from 'zod';

import {
  DEFAULT_REPORT_LIMIT,
  DEFAULT_REPORT_PAGE,
  MAX_REPORT_LIMIT,
  PRODUCT_REPORT_STATUSES,
  PRODUCT_REPORT_TYPES,
  REPORT_MESSAGE_MAX,
  REPORT_MESSAGE_MIN,
} from './constants';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const reportMessageSchema = z
  .string()
  .trim()
  .min(REPORT_MESSAGE_MIN, `Message must be at least ${REPORT_MESSAGE_MIN} characters`)
  .max(REPORT_MESSAGE_MAX, `Message must be at most ${REPORT_MESSAGE_MAX} characters`);

export const productReportTypeSchema = z.enum(PRODUCT_REPORT_TYPES);
export const productReportStatusSchema = z.enum(PRODUCT_REPORT_STATUSES);

export type ProductReportType = z.infer<typeof productReportTypeSchema>;
export type ProductReportStatus = z.infer<typeof productReportStatusSchema>;

export const productIdParamsSchema = z.object({
  productId: objectIdSchema,
});

export const reportIdParamsSchema = z.object({
  reportId: objectIdSchema,
});

export const createProductReportSchema = z.object({
  type: productReportTypeSchema,
  message: reportMessageSchema,
});

export const listProductReportsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(DEFAULT_REPORT_PAGE),
  limit: z.coerce.number().int().min(1).max(MAX_REPORT_LIMIT).default(DEFAULT_REPORT_LIMIT),
  status: productReportStatusSchema.optional(),
});

export const updateProductReportStatusSchema = z.object({
  status: z.enum(['reviewed', 'dismissed']),
});

export type CreateProductReportInput = z.infer<typeof createProductReportSchema>;
export type ListProductReportsQuery = z.infer<typeof listProductReportsQuerySchema>;
export type UpdateProductReportStatusInput = z.infer<typeof updateProductReportStatusSchema>;
