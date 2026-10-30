import { Types } from 'mongoose';
import { env } from '../../config/env';
import { OrderModel } from '../../models/order.model';
import { ProductVariantModel } from '../../models/productVariant.model';
import { syncListing } from '../../services/variant.service';
import { AppError } from '../../utils/AppError';
import type { ResolvedLine } from './pricing';

type Reservation = {
  variantId: Types.ObjectId;
  productId: Types.ObjectId;
  quantity: number;
};

export const reserveStock = async (lines: ResolvedLine[]): Promise<Reservation[]> => {
  const reserved: Reservation[] = [];

  for (const line of lines) {
    const updated = await ProductVariantModel.findOneAndUpdate(
      {
        _id: line.variantObjectId,
        status: 'active',
        stock: { $gte: line.quantity },
      },
      { $inc: { stock: -line.quantity } },
      { new: true },
    ).select('_id productId stock');

    if (!updated) {
      await releaseReservations(reserved);
      throw AppError.validation(`Not enough stock for SKU ${line.sku}`);
    }

    reserved.push({
      variantId: line.variantObjectId,
      productId: line.productObjectId,
      quantity: line.quantity,
    });

    await syncListing(line.productObjectId);
  }

  return reserved;
};

export const releaseReservations = async (reservations: Reservation[]) => {
  const touchedProducts = new Set<string>();

  for (const reservation of reservations) {
    await ProductVariantModel.updateOne(
      { _id: reservation.variantId },
      { $inc: { stock: reservation.quantity } },
    );

    touchedProducts.add(String(reservation.productId));
  }

  for (const productId of touchedProducts) {
    await syncListing(new Types.ObjectId(productId));
  }
};

export const releaseExpiredOrderHolds = async () => {
  const now = new Date();

  const expiredOrders = await OrderModel.find({
    status: 'awaiting_payment',
    stockReleasedAt: null,
    stockHoldExpiresAt: { $lte: now },
  }).select('_id stockReservations');

  for (const order of expiredOrders) {
    const released = await OrderModel.findOneAndUpdate(
      {
        _id: order._id,
        status: 'awaiting_payment',
        stockReleasedAt: null,
      },
      {
        $set: {
          status: 'expired',
          stockReleasedAt: now,
        },
      },
      { new: true },
    );

    if (!released) {
      continue;
    }

    const reservations = released.stockReservations.map((row) => ({
      variantId: row.variantId,
      productId: row.productId,
      quantity: row.quantity,
    }));

    if (reservations.length > 0) {
      await releaseReservations(reservations);
    }
  }
};

export const stockHoldExpiresAt = () =>
  new Date(Date.now() + env.ORDER_PAYMENT_HOLD_MINUTES * 60 * 1000);
