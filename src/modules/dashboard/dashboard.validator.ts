import { z } from 'zod';
import { DASHBOARD_RANGES } from './dashboard.constants';

export const dashboardOverviewQuerySchema = z.object({
  range: z.enum(DASHBOARD_RANGES).optional().default('7d'),
});

export type DashboardOverviewQuery = z.infer<typeof dashboardOverviewQuerySchema>;
