import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendSuccess } from '../../common/http/sendResponse';
import { financeReportService } from './finance-report.service';

const summary = asyncHandler(async (_req: Request, res: Response) => {
  const data = await financeReportService.summary();
  sendSuccess(res, data);
});

export const financeReportController = { summary };
