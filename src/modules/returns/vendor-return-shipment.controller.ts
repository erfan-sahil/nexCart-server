import type { Request, Response } from 'express';
import { Permission } from '../../common/constants/permissions';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendPaginated, sendSuccess } from '../../common/http/sendResponse';
import { AppError } from '../../common/errors/AppError';
import { readIdempotencyKey, runIdempotent } from '../../common/utils/idempotency';
import { IdempotencyScope } from '../orders/constants';
import { vendorReturnShipmentService } from './vendor-return-shipment.service';
import type {
  DispatchVendorReturnShipmentBody,
  ListVendorReturnShipmentsQuery,
} from './vendor-return-shipment.validator';

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

const shipmentIdParam = (req: Request) => {
  const shipmentId = Array.isArray(req.params.shipmentId)
    ? req.params.shipmentId[0]
    : req.params.shipmentId;

  return shipmentId ?? '';
};

const listAdmin = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListVendorReturnShipmentsQuery;
  const result = await vendorReturnShipmentService.listForAdmin(query.page, query.limit, {
    status: query.status,
    storeId: query.storeId,
    parentOrderId: query.parentOrderId,
  });

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const getAdmin = asyncHandler(async (req: Request, res: Response) => {
  const data = await vendorReturnShipmentService.getById(shipmentIdParam(req));
  sendSuccess(res, data);
});

const dispatch = asyncHandler(async (req: Request, res: Response) => {
  const actorId = adminId(req);
  const body = req.body as DispatchVendorReturnShipmentBody;
  const data = await runIdempotent({
    customerId: actorId,
    scope: IdempotencyScope.adminVendorReturnDispatch,
    key: readIdempotencyKey(req.headers['idempotency-key']),
    requestBody: body,
    handler: async () => ({
      statusCode: 200,
      body: await vendorReturnShipmentService.dispatch(actorId, shipmentIdParam(req), body),
    }),
  });

  sendSuccess(res, data, { message: 'Vendor return shipment dispatched' });
});

const listVendor = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListVendorReturnShipmentsQuery;
  const result = await vendorReturnShipmentService.listForVendor(
    vendorUserId(req),
    query.page,
    query.limit,
    query.status,
  );

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const getVendor = asyncHandler(async (req: Request, res: Response) => {
  const data = await vendorReturnShipmentService.getById(shipmentIdParam(req));

  if (data.vendorUserId !== vendorUserId(req)) {
    throw AppError.notFound('Vendor return shipment not found');
  }

  sendSuccess(res, data);
});

const confirmReceipt = asyncHandler(async (req: Request, res: Response) => {
  const actorId = vendorUserId(req);
  const body = { action: 'confirm_receipt' as const };
  const data = await runIdempotent({
    customerId: actorId,
    scope: IdempotencyScope.vendorReturnConfirmReceipt,
    key: readIdempotencyKey(req.headers['idempotency-key']),
    requestBody: body,
    handler: async () => ({
      statusCode: 200,
      body: await vendorReturnShipmentService.confirmReceipt(actorId, shipmentIdParam(req)),
    }),
  });

  sendSuccess(res, data, { message: 'Returned products confirmed received' });
});

export const vendorReturnShipmentPermissions = {
  vendor: Permission.vendorOrders,
  admin: Permission.adminOrders,
} as const;

export const vendorReturnShipmentController = {
  listAdmin,
  getAdmin,
  dispatch,
  listVendor,
  getVendor,
  confirmReceipt,
};
