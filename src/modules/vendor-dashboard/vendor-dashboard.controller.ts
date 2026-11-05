import type { Request, Response } from 'express';

import { Permission } from '../../common/constants/permissions';
import { AppError } from '../../common/errors/AppError';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendSuccess } from '../../common/http/sendResponse';
import type {
  VendorAnalyticsQuery,
  VendorDashboardOverviewQuery,
} from './vendor-dashboard.validator';
import { vendorDashboardService } from './vendor-dashboard.service';

const vendorUserId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const overview = asyncHandler(async (req: Request, res: Response) => {
  const { range } = req.query as unknown as VendorDashboardOverviewQuery;
  const data = await vendorDashboardService.overview(vendorUserId(req), range);
  sendSuccess(res, data);
});

const analytics = asyncHandler(async (req: Request, res: Response) => {
  const { range } = req.query as unknown as VendorAnalyticsQuery;
  const data = await vendorDashboardService.analytics(vendorUserId(req), range);
  sendSuccess(res, data);
});

export const vendorDashboardController = {
  overview,
  analytics,
};

export const vendorDashboardPermissions = {
  overview: Permission.vendorAnalytics,
  analytics: Permission.vendorAnalytics,
};
