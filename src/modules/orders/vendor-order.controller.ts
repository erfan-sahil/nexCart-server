import type { Request, Response } from 'express';
import { Permission } from '../../common/constants/permissions';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendPaginated, sendSuccess } from '../../common/http/sendResponse';
import { AppError } from '../../common/errors/AppError';
import { vendorOrderService } from './vendor-order.service';
import type { ListVendorOrdersQuery } from './vendor-order.validator';

const vendorUserId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListVendorOrdersQuery;
  const result = await vendorOrderService.listForVendor(vendorUserId(req), query);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const summary = asyncHandler(async (req: Request, res: Response) => {
  const data = await vendorOrderService.summaryForVendor(vendorUserId(req));
  sendSuccess(res, data);
});

const getById = asyncHandler(async (req: Request, res: Response) => {
  const vendorOrderId = Array.isArray(req.params.vendorOrderId)
    ? req.params.vendorOrderId[0]
    : req.params.vendorOrderId;
  const data = await vendorOrderService.getForVendor(vendorUserId(req), vendorOrderId ?? '');

  sendSuccess(res, data);
});

const accept = asyncHandler(async (req: Request, res: Response) => {
  const vendorOrderId = Array.isArray(req.params.vendorOrderId)
    ? req.params.vendorOrderId[0]
    : req.params.vendorOrderId;
  const data = await vendorOrderService.accept(vendorUserId(req), vendorOrderId ?? '');

  sendSuccess(res, data, { message: 'Order accepted' });
});

const prepare = asyncHandler(async (req: Request, res: Response) => {
  const vendorOrderId = Array.isArray(req.params.vendorOrderId)
    ? req.params.vendorOrderId[0]
    : req.params.vendorOrderId;
  const data = await vendorOrderService.prepare(vendorUserId(req), vendorOrderId ?? '');

  sendSuccess(res, data, { message: 'Preparation started' });
});

const markReady = asyncHandler(async (req: Request, res: Response) => {
  const vendorOrderId = Array.isArray(req.params.vendorOrderId)
    ? req.params.vendorOrderId[0]
    : req.params.vendorOrderId;
  const data = await vendorOrderService.markReady(vendorUserId(req), vendorOrderId ?? '');

  sendSuccess(res, data, { message: 'Marked ready to ship' });
});

const dispatchInbound = asyncHandler(async (req: Request, res: Response) => {
  const vendorOrderId = Array.isArray(req.params.vendorOrderId)
    ? req.params.vendorOrderId[0]
    : req.params.vendorOrderId;
  const body = req.body as { inboundCarrier: string; inboundTracking: string };
  const data = await vendorOrderService.dispatchInbound(
    vendorUserId(req),
    vendorOrderId ?? '',
    body,
  );

  sendSuccess(res, data, { message: 'Inbound shipment dispatched' });
});

const markInboundInTransit = asyncHandler(async (req: Request, res: Response) => {
  const vendorOrderId = Array.isArray(req.params.vendorOrderId)
    ? req.params.vendorOrderId[0]
    : req.params.vendorOrderId;
  const data = await vendorOrderService.markInboundInTransit(
    vendorUserId(req),
    vendorOrderId ?? '',
  );

  sendSuccess(res, data, { message: 'Marked in transit' });
});

export const vendorOrderController = {
  list,
  summary,
  getById,
  accept,
  prepare,
  markReady,
  dispatchInbound,
  markInboundInTransit,
};

export const vendorOrderPermissions = {
  list: Permission.vendorOrders,
  read: Permission.vendorOrders,
  summary: Permission.vendorOrders,
  accept: Permission.vendorOrders,
  prepare: Permission.vendorOrders,
  ready: Permission.vendorOrders,
  dispatchInbound: Permission.vendorShipping,
  markInboundInTransit: Permission.vendorShipping,
};
