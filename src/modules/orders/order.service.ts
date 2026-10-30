import { Types } from 'mongoose';
import { OrderModel } from '../../models/order.model';
import { ProductModel } from '../../models/product.model';
import { ShipmentModel } from '../../models/shipment.model';
import { UserModel } from '../../models/user.model';
import { AppError } from '../../utils/AppError';
import { isDuplicateKeyError } from '../../utils/mongoError';
import { runIdempotent } from '../../utils/idempotency';
import { IdempotencyScope } from './constants';
import { assertOrderOwner, customerObjectId, toOrderDto, toOrderTrackingDto } from './order.mapper';
import { buildOrderNumber, buildTotals, quoteCheckout, resolveCheckoutLines } from './pricing';
import {
  releaseExpiredOrderHolds,
  releaseReservations,
  reserveStock,
  stockHoldExpiresAt,
} from './stock';
import type { OrderDto, OrderQuoteDto, OrderTrackingDto } from './types';
import type {
  CreateOrderInput,
  ListOrdersQuery,
  QuoteOrderInput,
  TrackOrderInput,
} from './order.validator';

const TRACK_MISS = 'No order matches that number and email';

type Actor = {
  customerId: string;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const orderService = {
  async quote(input: QuoteOrderInput): Promise<OrderQuoteDto> {
    await releaseExpiredOrderHolds();

    return quoteCheckout({
      paymentMethod: input.paymentMethod,
      items: input.items,
    });
  },

  async create(actor: Actor, idempotencyKey: string, input: CreateOrderInput): Promise<OrderDto> {
    await releaseExpiredOrderHolds();

    return runIdempotent({
      customerId: actor.customerId,
      scope: IdempotencyScope.orderCreate,
      key: idempotencyKey,
      requestBody: input,
      handler: async () => {
        const resolved = await resolveCheckoutLines(input.items);
        const itemsSubtotal = money(resolved.reduce((sum, line) => sum + line.lineTotal, 0));
        const totals = buildTotals(input.paymentMethod, itemsSubtotal);
        const reservations = await reserveStock(resolved);

        try {
          const order = await OrderModel.create({
            orderNumber: buildOrderNumber(),
            customerId: customerObjectId(actor.customerId),
            idempotencyKey,
            paymentMethod: input.paymentMethod,
            status: 'awaiting_payment',
            paymentStatus: 'unpaid',
            codCollectionStatus: 'not_applicable',
            shipping: input.shipping,
            note: input.note ?? '',
            items: resolved.map(
              ({
                variantObjectId,
                productObjectId,
                storeObjectId,
                productName,
                storeName,
                sku,
                quantity,
                unitPrice,
                lineTotal,
              }) => ({
                variantId: variantObjectId,
                productId: productObjectId,
                storeId: storeObjectId,
                productName,
                storeName,
                sku,
                quantity,
                unitPrice,
                lineTotal,
              }),
            ),
            stockReservations: reservations.map((row) => ({
              variantId: row.variantId,
              productId: row.productId,
              quantity: row.quantity,
            })),
            itemsSubtotal: totals.itemsSubtotal,
            deliveryFee: totals.deliveryFee,
            grandTotal: totals.grandTotal,
            amountDueNow: totals.amountDueNow,
            amountPaid: 0,
            balanceDue: totals.balanceDue,
            refundableAmount: 0,
            currency: totals.currency,
            stockHoldExpiresAt: stockHoldExpiresAt(),
            stockReleasedAt: null,
            saleRecordedAt: null,
          });

          const dto = toOrderDto(order);

          return { statusCode: 201, body: dto };
        } catch (error) {
          await releaseReservations(reservations);

          if (isDuplicateKeyError(error)) {
            const existing = await OrderModel.findOne({
              customerId: customerObjectId(actor.customerId),
              idempotencyKey,
            });

            if (existing) {
              return { statusCode: 201, body: toOrderDto(existing) };
            }
          }

          throw error;
        }
      },
    });
  },

  async list(actor: Actor, query: ListOrdersQuery) {
    await releaseExpiredOrderHolds();

    const filter = { customerId: customerObjectId(actor.customerId) };
    const skip = (query.page - 1) * query.limit;

    const [orders, total] = await Promise.all([
      OrderModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(query.limit),
      OrderModel.countDocuments(filter),
    ]);

    return {
      items: orders.map(toOrderDto),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async getById(actor: Actor, orderId: string): Promise<OrderDto> {
    await releaseExpiredOrderHolds();

    if (!Types.ObjectId.isValid(orderId)) {
      throw AppError.notFound('Order not found');
    }

    const order = await OrderModel.findById(orderId);

    if (!order) {
      throw AppError.notFound('Order not found');
    }

    assertOrderOwner(order, actor.customerId);

    return toOrderDto(order);
  },

  async track(input: TrackOrderInput): Promise<OrderTrackingDto> {
    await releaseExpiredOrderHolds();

    const order = await OrderModel.findOne({ orderNumber: input.orderNumber });

    if (!order) {
      throw AppError.notFound(TRACK_MISS);
    }

    const customer = await UserModel.findById(order.customerId).select('email');

    if (!customer || customer.email !== input.email) {
      throw AppError.notFound(TRACK_MISS);
    }

    const [shipment, products] = await Promise.all([
      ShipmentModel.findOne({ orderId: order._id }),
      ProductModel.find({
        _id: { $in: [...new Set(order.items.map((item) => item.productId))] },
      }).select('slug images thumbnailId'),
    ]);

    return toOrderTrackingDto(
      order,
      shipment,
      new Map(products.map((product) => [String(product._id), product])),
    );
  },
};
