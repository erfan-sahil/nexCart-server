import { Types } from 'mongoose';
import {
  SALES_WINDOW_DAYS,
  TRENDING_SALE_WEIGHT,
  TRENDING_WINDOW_DAYS,
} from '../constants/catalog';
import { CatalogSignalModel } from '../models/catalogSignal.model';
import { ProductModel } from '../models/product.model';
import { StoreModel } from '../models/store.model';
import { AppError } from '../utils/AppError';

const DAY_MS = 24 * 60 * 60 * 1000;

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const windowStart = (days: number, now: Date) => new Date(now.getTime() - days * DAY_MS);

const sumUnits = async (productId: Types.ObjectId, kind: 'sale' | 'view', since: Date) => {
  const [row] = await CatalogSignalModel.aggregate<{ units: number }>([
    {
      $match: {
        productId,
        kind,
        occurredAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: null,
        units: { $sum: '$units' },
      },
    },
  ]);

  return row?.units ?? 0;
};

const recomputeMetrics = async (productId: Types.ObjectId) => {
  const now = new Date();
  const since30 = windowStart(SALES_WINDOW_DAYS, now);
  const since7 = windowStart(TRENDING_WINDOW_DAYS, now);
  const [unitsSold30d, unitsSold7d, views7d] = await Promise.all([
    sumUnits(productId, 'sale', since30),
    sumUnits(productId, 'sale', since7),
    sumUnits(productId, 'view', since7),
  ]);

  await ProductModel.updateOne(
    { _id: productId },
    {
      $set: {
        'metrics.unitsSold30d': unitsSold30d,
        'metrics.unitsSold7d': unitsSold7d,
        'metrics.views7d': views7d,
        'metrics.trendingScore': unitsSold7d * TRENDING_SALE_WEIGHT + views7d,
      },
    },
  );
};

const requireProduct = async (productId: string) => {
  if (!Types.ObjectId.isValid(productId)) {
    throw AppError.validation('Product not found');
  }

  const product = await ProductModel.findById(productId).select('_id storeId');

  if (!product) {
    throw AppError.notFound('Product not found');
  }

  return product;
};

export const catalogStatsService = {
  /**
   * Records one completed sale line. Checkout should call this once per product
   * after the order is completed. Counts stay at zero until then.
   */
  async recordSale(input: { productId: string; units: number; amount: number; occurredAt?: Date }) {
    if (!Number.isInteger(input.units) || input.units < 1) {
      throw AppError.validation('Sale units must be a whole number greater than 0');
    }

    if (!Number.isFinite(input.amount) || input.amount < 0) {
      throw AppError.validation('Sale amount cannot be negative');
    }

    const product = await requireProduct(input.productId);
    const amount = money(input.amount);

    await CatalogSignalModel.create({
      productId: product._id,
      storeId: product.storeId,
      kind: 'sale',
      units: input.units,
      amount,
      occurredAt: input.occurredAt ?? new Date(),
    });

    await recomputeMetrics(product._id);
    await StoreModel.updateOne(
      { _id: product.storeId },
      { $inc: { totalOrders: 1, totalSales: amount } },
    );
  },

  /**
   * Records one product view. A future storefront view tracker can call this.
   * Windowed view counts move only when a signal is recorded for that product.
   */
  async recordView(input: { productId: string; occurredAt?: Date }) {
    const product = await requireProduct(input.productId);

    await CatalogSignalModel.create({
      productId: product._id,
      storeId: product.storeId,
      kind: 'view',
      units: 1,
      amount: 0,
      occurredAt: input.occurredAt ?? new Date(),
    });

    await recomputeMetrics(product._id);
  },
};
