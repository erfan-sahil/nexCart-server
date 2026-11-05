import type { Request, Response } from 'express';
import { Permission } from '../../common/constants/permissions';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendPaginated, sendSuccess } from '../../common/http/sendResponse';
import { AppError } from '../../common/errors/AppError';
import { readIdempotencyKey, runIdempotent } from '../../common/utils/idempotency';
import { IdempotencyScope } from '../orders/constants';
import { returnService } from './return.service';
import type { InspectReturnBody, ListReturnsQuery, ResolveReturnBody } from './return.validator';

const adminId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const vendorUserId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const returnIdParam = (req: Request) => {
  const returnId = Array.isArray(req.params.returnId)
    ? req.params.returnId[0]
    : req.params.returnId;

  return returnId ?? '';
};

const listVendor = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListReturnsQuery;
  const result = await returnService.listForVendor(vendorUserId(req), query.page, query.limit);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const listAdmin = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListReturnsQuery;
  const result = await returnService.listForAdmin(query.page, query.limit, {
    status: query.status,
    kind: query.kind,
    parentOrderId: query.parentOrderId,
  });

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const getAdmin = asyncHandler(async (req: Request, res: Response) => {
  const data = await returnService.getById(returnIdParam(req));
  sendSuccess(res, data);
});

const previewRefund = asyncHandler(async (req: Request, res: Response) => {
  const data = await returnService.previewRefund(returnIdParam(req));
  sendSuccess(res, data);
});

const markReturning = asyncHandler(async (req: Request, res: Response) => {
  const actorId = adminId(req);
  const body = { action: 'mark_returning' as const };
  const data = await runIdempotent({
    customerId: actorId,
    scope: IdempotencyScope.adminReturnAction,
    key: readIdempotencyKey(req.headers['idempotency-key']),
    requestBody: body,
    handler: async () => ({
      statusCode: 200,
      body: await returnService.markReturning(actorId, returnIdParam(req)),
    }),
  });

  sendSuccess(res, data, { message: 'Return marked returning to warehouse' });
});

const markReceived = asyncHandler(async (req: Request, res: Response) => {
  const actorId = adminId(req);
  const body = { action: 'mark_received' as const };
  const data = await runIdempotent({
    customerId: actorId,
    scope: IdempotencyScope.adminReturnAction,
    key: readIdempotencyKey(req.headers['idempotency-key']),
    requestBody: body,
    handler: async () => ({
      statusCode: 200,
      body: await returnService.markReceived(actorId, returnIdParam(req)),
    }),
  });

  sendSuccess(res, data, { message: 'Return received at warehouse' });
});

const inspect = asyncHandler(async (req: Request, res: Response) => {
  const actorId = adminId(req);
  const body = req.body as InspectReturnBody;
  const data = await runIdempotent({
    customerId: actorId,
    scope: IdempotencyScope.adminReturnAction,
    key: readIdempotencyKey(req.headers['idempotency-key']),
    requestBody: body,
    handler: async () => ({
      statusCode: 200,
      body: await returnService.inspect(actorId, returnIdParam(req), body),
    }),
  });

  sendSuccess(res, data, { message: 'Return inspected' });
});

const resolve = asyncHandler(async (req: Request, res: Response) => {
  const actorId = adminId(req);
  const body = req.body as ResolveReturnBody;
  const data = await runIdempotent({
    customerId: actorId,
    scope: IdempotencyScope.adminReturnAction,
    key: readIdempotencyKey(req.headers['idempotency-key']),
    requestBody: body,
    handler: async () => ({
      statusCode: 200,
      body: await returnService.resolveManually(actorId, returnIdParam(req), body),
    }),
  });

  sendSuccess(res, data, { message: 'Return resolved' });
});

const listRefundTransactions = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListReturnsQuery;
  const result = await returnService.listRefundTransactions(query.page, query.limit);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const approve = asyncHandler(async (req: Request, res: Response) => {
  const data = await returnService.approve(adminId(req), returnIdParam(req));
  sendSuccess(res, data, { message: 'Return approved' });
});

const refund = asyncHandler(async (req: Request, res: Response) => {
  const data = await returnService.markRefunded(adminId(req), returnIdParam(req));
  sendSuccess(res, data, { message: 'Return refunded' });
});

export const returnPermissions = {
  vendor: Permission.vendorOrders,
  admin: Permission.adminOrders,
} as const;

export const returnController = {
  listVendor,
  listAdmin,
  getAdmin,
  previewRefund,
  markReturning,
  markReceived,
  inspect,
  resolve,
  listRefundTransactions,
  approve,
  refund,
};
