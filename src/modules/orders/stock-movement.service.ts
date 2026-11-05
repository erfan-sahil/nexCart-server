import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import { ProductVariantModel } from '../products/product-variant.model';
import { syncListing } from '../products/variant.service';
import { isDuplicateKeyError } from '../../common/errors/mongoError';
import type { StockCustody } from './constants';
import { StockMovementModel } from './stock-movement.model';

type RecordMovementInput = {
  orderId?: Types.ObjectId | string | null;
  variantId: Types.ObjectId;
  productId: Types.ObjectId;
  quantity: number;
  direction: 'decrement' | 'increment';
  custody: StockCustody;
  reason: string;
  idempotencyKey: string;
  session?: ClientSession;
};

export const recordStockMovement = async (input: RecordMovementInput): Promise<boolean> => {
  if (input.session) {
    const existing = await StockMovementModel.findOne({
      idempotencyKey: input.idempotencyKey,
    }).session(input.session);

    if (existing) {
      return false;
    }

    await StockMovementModel.create(
      [
        {
          orderId: input.orderId ? new Types.ObjectId(input.orderId) : null,
          variantId: input.variantId,
          productId: input.productId,
          quantity: input.quantity,
          direction: input.direction,
          custody: input.custody,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
        },
      ],
      { session: input.session },
    );
    return true;
  }

  try {
    await StockMovementModel.create({
      orderId: input.orderId ? new Types.ObjectId(input.orderId) : null,
      variantId: input.variantId,
      productId: input.productId,
      quantity: input.quantity,
      direction: input.direction,
      custody: input.custody,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
    return true;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return false;
    }

    throw error;
  }
};

export const restoreStockWithMovement = async (input: {
  orderId: Types.ObjectId | string;
  variantId: Types.ObjectId;
  productId: Types.ObjectId;
  quantity: number;
  idempotencyKey: string;
  reason: string;
  session?: ClientSession;
  /** When true, skip syncListing (caller should sync after commit). */
  deferListingSync?: boolean;
}) => {
  const recorded = await recordStockMovement({
    orderId: input.orderId,
    variantId: input.variantId,
    productId: input.productId,
    quantity: input.quantity,
    direction: 'increment',
    custody: 'at_vendor',
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
    session: input.session,
  });

  if (!recorded) {
    return false;
  }

  const update = ProductVariantModel.updateOne(
    { _id: input.variantId },
    { $inc: { stock: input.quantity } },
  );

  if (input.session) {
    await update.session(input.session);
  } else {
    await update;
  }

  if (!input.deferListingSync) {
    await syncListing(input.productId);
  }

  return true;
};

/** Accepted at warehouse: custody transfer only — sellable stock was already reserved at checkout. */
export const moveReservedToWarehouseCustody = async (input: {
  orderId: Types.ObjectId | string;
  variantId: Types.ObjectId;
  productId: Types.ObjectId;
  quantity: number;
  idempotencyKey: string;
  session?: ClientSession;
}) => {
  await recordStockMovement({
    orderId: input.orderId,
    variantId: input.variantId,
    productId: input.productId,
    quantity: input.quantity,
    direction: 'decrement',
    custody: 'at_vendor',
    reason: 'warehouse_accept_custody_out',
    idempotencyKey: `${input.idempotencyKey}:out`,
    session: input.session,
  });

  await recordStockMovement({
    orderId: input.orderId,
    variantId: input.variantId,
    productId: input.productId,
    quantity: input.quantity,
    direction: 'increment',
    custody: 'at_warehouse',
    reason: 'warehouse_accept_custody_in',
    idempotencyKey: `${input.idempotencyKey}:in`,
    session: input.session,
  });
};
