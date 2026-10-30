import type { Request, Response } from 'express';
import { Permission } from '../../constants/permissions';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendPaginated, sendSuccess } from '../../utils/sendResponse';
import { AppError } from '../../utils/AppError';
import { fulfillmentService } from './fulfillment.service';
import type {
  DispatchFulfillmentInput,
  InspectFulfillmentInput,
  ListVendorFulfillmentsQuery,
  ReceiveFulfillmentInput,
  ShipOrderInput,
} from './fulfillment.validator';

const routeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const actorId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const listVendor = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListVendorFulfillmentsQuery;
  const result = await fulfillmentService.listForVendor(actorId(req), query);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const getVendor = asyncHandler(async (req: Request, res: Response) => {
  const data = await fulfillmentService.getForVendor(
    actorId(req),
    routeParam(req.params.fulfillmentId),
  );

  sendSuccess(res, data);
});

const dispatch = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as DispatchFulfillmentInput;
  const data = await fulfillmentService.dispatch(
    actorId(req),
    routeParam(req.params.fulfillmentId),
    body,
  );

  sendSuccess(res, data, { message: 'Inbound shipment dispatched' });
});

const receive = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as ReceiveFulfillmentInput;
  const data = await fulfillmentService.receive(
    actorId(req),
    routeParam(req.params.fulfillmentId),
    body,
  );

  sendSuccess(res, data, { message: 'Warehouse receipt recorded' });
});

const inspect = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as InspectFulfillmentInput;
  const data = await fulfillmentService.inspect(
    actorId(req),
    routeParam(req.params.fulfillmentId),
    body,
  );

  sendSuccess(res, data, { message: 'Inspection recorded' });
});

const getAdminFulfillment = asyncHandler(async (req: Request, res: Response) => {
  const data = await fulfillmentService.getForAdmin(routeParam(req.params.fulfillmentId));

  sendSuccess(res, data);
});

const packShipment = asyncHandler(async (req: Request, res: Response) => {
  const data = await fulfillmentService.packShipment(actorId(req), routeParam(req.params.orderId));

  sendSuccess(res, data, { message: 'Shipment ready to pack' });
});

const shipOrder = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as ShipOrderInput;
  const data = await fulfillmentService.shipOrder(
    actorId(req),
    routeParam(req.params.orderId),
    body,
  );

  sendSuccess(res, data, { message: 'Order shipped to customer' });
});

const deliverOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = await fulfillmentService.deliverOrder(actorId(req), routeParam(req.params.orderId));

  sendSuccess(res, data, { message: 'Order delivered' });
});

const recordCodCollection = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { amountCollected?: number; note?: string };
  const data = await fulfillmentService.recordCodCollection(
    actorId(req),
    routeParam(req.params.orderId),
    body,
  );

  sendSuccess(res, data, { message: 'Cash collection recorded' });
});

const getOrderFulfillment = asyncHandler(async (req: Request, res: Response) => {
  const data = await fulfillmentService.getOrderFulfillmentSummary(routeParam(req.params.orderId));

  sendSuccess(res, data);
});

export const fulfillmentController = {
  listVendor,
  getVendor,
  dispatch,
  receive,
  inspect,
  getAdminFulfillment,
  packShipment,
  shipOrder,
  deliverOrder,
  recordCodCollection,
  getOrderFulfillment,
};

export const fulfillmentPermissions = {
  vendorList: Permission.vendorOrders,
  vendorRead: Permission.vendorOrders,
  vendorDispatch: Permission.vendorShipping,
  adminRead: Permission.adminOrders,
  adminWarehouse: Permission.adminOrders,
};
