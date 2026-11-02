import type { Request, Response } from 'express';
import { Permission } from '../../common/constants/permissions';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendPaginated, sendSuccess } from '../../common/http/sendResponse';
import { AppError } from '../../common/errors/AppError';
import { withdrawalService } from './withdrawal.service';
import type {
  CreateWithdrawalInput,
  ListWithdrawalsQuery,
  ReviewWithdrawalInput,
} from './withdrawal.validator';

const vendorUserId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const adminId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateWithdrawalInput;
  const data = await withdrawalService.create(vendorUserId(req), body.amount);
  sendSuccess(res, data, { message: 'Withdrawal requested' });
});

const cancel = asyncHandler(async (req: Request, res: Response) => {
  const withdrawalId = Array.isArray(req.params.withdrawalId)
    ? req.params.withdrawalId[0]
    : req.params.withdrawalId;
  const data = await withdrawalService.cancel(vendorUserId(req), withdrawalId ?? '');
  sendSuccess(res, data, { message: 'Withdrawal cancelled' });
});

const listMine = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListWithdrawalsQuery;
  const result = await withdrawalService.listForVendor(vendorUserId(req), query.page, query.limit);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const listAdmin = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListWithdrawalsQuery;
  const result = await withdrawalService.listForAdmin(query.status, query.page, query.limit);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const review = asyncHandler(async (req: Request, res: Response) => {
  const withdrawalId = Array.isArray(req.params.withdrawalId)
    ? req.params.withdrawalId[0]
    : req.params.withdrawalId;
  const body = req.body as ReviewWithdrawalInput;
  const data = await withdrawalService.review(adminId(req), withdrawalId ?? '', body.action, {
    reviewNote: body.reviewNote,
    payoutReference: body.payoutReference,
  });

  sendSuccess(res, data, { message: 'Withdrawal updated' });
});

export const withdrawalPermissions = {
  vendor: Permission.vendorAnalytics,
  admin: Permission.adminCommission,
} as const;

export const withdrawalController = {
  create,
  cancel,
  listMine,
  listAdmin,
  review,
};
