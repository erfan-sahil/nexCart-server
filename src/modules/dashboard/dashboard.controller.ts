import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendSuccess } from '../../common/http/sendResponse';
import { adminDashboardService } from './dashboard.service';
import type { DashboardOverviewQuery } from './dashboard.validator';

const overview = asyncHandler(async (req: Request, res: Response) => {
  const { range } = req.query as unknown as DashboardOverviewQuery;
  const data = await adminDashboardService.overview(range);
  sendSuccess(res, data);
});

export const adminDashboardController = { overview };
