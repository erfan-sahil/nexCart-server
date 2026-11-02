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
};

export const recordStockMovement = async (input: RecordMovementInput): Promise<boolean> => {
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
  });

  if (!recorded) {
    return;
  }

  await ProductVariantModel.updateOne(
    { _id: input.variantId },
    { $inc: { stock: input.quantity } },
  );
  await syncListing(input.productId);
};

/** Accepted at warehouse: custody transfer only — sellable stock was already reserved at checkout. */
export const moveReservedToWarehouseCustody = async (input: {
  orderId: Types.ObjectId | string;
  variantId: Types.ObjectId;
  productId: Types.ObjectId;
  quantity: number;
  idempotencyKey: string;
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
  });
};
