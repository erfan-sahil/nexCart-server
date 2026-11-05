import { Router } from 'express';

import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import {
  vendorAnalyticsQuerySchema,
  vendorDashboardOverviewQuerySchema,
} from './vendor-dashboard.validator';
import {
  vendorDashboardController,
  vendorDashboardPermissions,
} from './vendor-dashboard.controller';

export const vendorDashboardRouter = Router();

vendorDashboardRouter.get(
  '/overview',
  ...requirePermissions(vendorDashboardPermissions.overview),
  validate({ query: vendorDashboardOverviewQuerySchema }),
  vendorDashboardController.overview,
);

export const vendorAnalyticsRouter = Router();

vendorAnalyticsRouter.get(
  '/',
  ...requirePermissions(vendorDashboardPermissions.analytics),
  validate({ query: vendorAnalyticsQuerySchema }),
  vendorDashboardController.analytics,
);
