import { Router } from 'express';
import { requirePermissions } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { paymentController, paymentPermissions } from '../payments/payment.controller';
import { initiatePaymentBodySchema } from '../payments/payment.validator';
import { orderController, orderPermissions } from './order.controller';
import {
  createOrderSchema,
  listOrdersQuerySchema,
  orderIdParamsSchema,
  quoteOrderSchema,
} from './order.validator';

export const orderRouter = Router();

orderRouter.post(
  '/quote',
  ...requirePermissions(orderPermissions.quote),
  validate({ body: quoteOrderSchema }),
  orderController.quote,
);

orderRouter.post(
  '/',
  ...requirePermissions(orderPermissions.create),
  validate({ body: createOrderSchema }),
  orderController.create,
);

orderRouter.get(
  '/',
  ...requirePermissions(orderPermissions.list),
  validate({ query: listOrdersQuerySchema }),
  orderController.list,
);

orderRouter.post(
  '/:orderId/payments',
  ...requirePermissions(paymentPermissions.initiate),
  validate({ params: orderIdParamsSchema, body: initiatePaymentBodySchema }),
  paymentController.initiateForOrder,
);

orderRouter.get(
  '/:orderId',
  ...requirePermissions(orderPermissions.get),
  validate({ params: orderIdParamsSchema }),
  orderController.getById,
);
