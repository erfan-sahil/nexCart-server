import { Router } from 'express';
import { Permission } from '../../common/constants/permissions';
import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { adminDashboardController } from './dashboard.controller';
import { dashboardOverviewQuerySchema } from './dashboard.validator';

export const adminDashboardRouter = Router();

adminDashboardRouter.get(
  '/overview',
  ...requirePermissions(Permission.adminDashboard),
  validate({ query: dashboardOverviewQuerySchema }),
  adminDashboardController.overview,
);
