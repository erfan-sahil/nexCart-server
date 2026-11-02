import { Router } from 'express';
import { Permission } from '../../common/constants/permissions';
import { requirePermissions } from '../../common/middleware/authorize';
import { financeReportController } from './finance-report.controller';

export const adminFinanceReportRouter = Router();

adminFinanceReportRouter.get(
  '/summary',
  ...requirePermissions(Permission.adminCommission),
  financeReportController.summary,
);
