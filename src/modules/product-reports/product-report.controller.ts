import type { Request, Response } from 'express';

import { Permission } from '../../common/constants/permissions';
import { asyncHandler } from '../../common/http/asyncHandler';
import { AppError } from '../../common/errors/AppError';
import { sendCreated, sendSuccess } from '../../common/http/sendResponse';
import { productReportService } from './product-report.service';
import type {
  CreateProductReportInput,
  ListProductReportsQuery,
  UpdateProductReportStatusInput,
} from './product-report.validator';

const param = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const actor = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user;
};

const create = asyncHandler(async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const body = req.body as CreateProductReportInput;
  const user = actor(req);
  const result = await productReportService.create(productId, user.id, body);

  sendCreated(res, result, 'Report submitted');
});

const getMine = asyncHandler(async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const user = actor(req);
  const payload = await productReportService.getMine(productId, user.id);

  sendSuccess(res, payload, { message: 'Your report' });
});

const list = asyncHandler(async (req: Request, res: Response) => {
  const user = actor(req);
  const query = req.query as unknown as ListProductReportsQuery;
  const { payload, total } = await productReportService.list(user.role, user.id, query);

  sendSuccess(res, payload, {
    message: 'Product reports',
    meta: {
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: query.limit > 0 ? Math.ceil(total / query.limit) : 0,
      },
    },
  });
});

const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const reportId = param(req.params.reportId);
  const body = req.body as UpdateProductReportStatusInput;
  const result = await productReportService.updateStatus(reportId, body);

  sendSuccess(res, result, { message: 'Report updated' });
});

export const productReportController = {
  create,
  getMine,
  list,
  updateStatus,
};

export const productReportPermissions = {
  list: [Permission.adminProductReports, Permission.vendorProductReports] as const,
  updateStatus: Permission.adminProductReports,
};
