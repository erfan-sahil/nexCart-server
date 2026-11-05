import { z } from 'zod';
import { VENDOR_ANALYTICS_RANGES, VENDOR_DASHBOARD_RANGES } from './vendor-dashboard.constants';

export const vendorDashboardOverviewQuerySchema = z.object({
  range: z.enum(VENDOR_DASHBOARD_RANGES).optional().default('7d'),
});

export type VendorDashboardOverviewQuery = z.infer<typeof vendorDashboardOverviewQuerySchema>;

export const vendorAnalyticsQuerySchema = z.object({
  range: z.enum(VENDOR_ANALYTICS_RANGES).optional().default('30d'),
});

export type VendorAnalyticsQuery = z.infer<typeof vendorAnalyticsQuerySchema>;
