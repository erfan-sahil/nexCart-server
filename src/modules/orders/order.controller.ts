import type { Request, Response } from 'express';
import { Permission } from '../../constants/permissions';
import { asyncHandler } from '../../utils/asyncHandler';
import { readIdempotencyKey } from '../../utils/idempotency';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/sendResponse';
import { AppError } from '../../utils/AppError';
import { orderService } from './order.service';
import type { CreateOrderInput, ListOrdersQuery, QuoteOrderInput } from './order.validator';

const actorId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const quote = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as QuoteOrderInput;
  const data = await orderService.quote(body);

  sendSuccess(res, data, { message: 'Checkout quote' });
});

const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateOrderInput;
  const idempotencyKey = readIdempotencyKey(req.headers['idempotency-key']);
  const data = await orderService.create({ customerId: actorId(req) }, idempotencyKey, body);

  sendCreated(res, data, 'Order created');
});

const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListOrdersQuery;
  const result = await orderService.list({ customerId: actorId(req) }, query);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const getById = asyncHandler(async (req: Request, res: Response) => {
  const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
  const data = await orderService.getById({ customerId: actorId(req) }, orderId ?? '');

  sendSuccess(res, data);
});

export const orderController = {
  quote,
  create,
  list,
  getById,
};

export const orderPermissions = {
  quote: Permission.customerCheckout,
  create: Permission.customerCheckout,
  list: Permission.customerOrders,
  get: Permission.customerOrders,
};
