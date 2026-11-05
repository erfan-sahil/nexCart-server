import { Types } from 'mongoose';

import {
  averageOrderValue,
  fillSeries,
  getMonthWindows,
  getWindowsForDays,
  money,
  periodMetric,
  type TimeWindow,
} from '../dashboard/analytics-period';
import { DEFAULT_LOW_STOCK_AT } from '../inventory/constants';
import { inventoryService } from '../inventory/inventory.service';
import { VendorOrderModel } from '../orders/vendor-order.model';
import { ProductModel } from '../products/product.model';
import { ReviewModel } from '../reviews/review.model';
import { ReturnRequestModel } from '../returns/return-request.model';
import { StoreModel } from '../stores/store.model';
import { storeService } from '../stores/store.service';
import { walletService } from '../wallet/wallet.service';
import {
  ANALYTICS_TIMEZONE,
  DASHBOARD_LOW_STOCK_LIMIT,
  FULFILLMENT_CANCELLED,
  FULFILLMENT_DELIVERED,
  FULFILLMENT_WAREHOUSE_REJECTED,
  ORDER_QUEUE_ACTION_NEEDED,
  ORDER_QUEUE_DELIVERED,
  ORDER_QUEUE_IN_PROGRESS,
  ORDER_QUEUE_SHIPPED,
  RECENT_ORDERS_LIMIT,
  REVENUE_EXCLUDED_STATUSES,
  TOP_PRODUCTS_LIMIT,
  VENDOR_RANGE_DAYS,
  type VendorAnalyticsRange,
  type VendorDashboardRange,
} from './vendor-dashboard.constants';
import type { VendorAnalytics, VendorDashboardOverview } from './vendor-dashboard.types';

const netEarningsExpression = {
  $ifNull: [
    '$vendorEarnings',
    { $subtract: ['$itemsSubtotal', { $ifNull: ['$commissionAmount', 0] }] },
  ],
};

const unitsSoldExpression = {
  $reduce: {
    input: '$items',
    initialValue: 0,
    in: { $add: ['$$value', '$$this.quantity'] },
  },
};

const revenueStatusMatch = {
  status: { $nin: [...REVENUE_EXCLUDED_STATUSES] },
};

const dateGroupId = (bucket: 'day' | 'month') => ({
  $dateToString: {
    format: bucket === 'month' ? '%Y-%m' : '%Y-%m-%d',
    date: '$createdAt',
    timezone: ANALYTICS_TIMEZONE,
  },
});

type TotalsRow = {
  grossSales: number;
  netEarnings: number;
  commission: number;
  orders: number;
  unitsSold: number;
};

const emptyTotals = (): TotalsRow => ({
  grossSales: 0,
  netEarnings: 0,
  commission: 0,
  orders: 0,
  unitsSold: 0,
});

const readTotals = (rows: TotalsRow[] | undefined) => {
  const row = rows?.[0];
  if (!row) {
    return emptyTotals();
  }

  return {
    grossSales: money(row.grossSales),
    netEarnings: money(row.netEarnings),
    commission: money(row.commission),
    orders: row.orders,
    unitsSold: row.unitsSold,
  };
};

const totalsGroupStage = {
  $group: {
    _id: null,
    grossSales: { $sum: '$itemsSubtotal' },
    netEarnings: { $sum: netEarningsExpression },
    commission: { $sum: { $ifNull: ['$commissionAmount', 0] } },
    orders: { $sum: 1 },
    unitsSold: { $sum: unitsSoldExpression },
  },
};

const resolveAnalyticsWindow = (range: VendorAnalyticsRange) => {
  if (range === '12m') {
    const windows = getMonthWindows();
    return {
      ...windows,
      bucket: 'month' as const,
      range,
    };
  }

  const days = VENDOR_RANGE_DAYS[range];
  const windows = getWindowsForDays(days);

  return {
    current: windows.current,
    previous: windows.previous,
    bucketCount: days,
    bucket: 'day' as const,
    range,
  };
};

const aggregateOrderMetrics = async (
  storeId: Types.ObjectId,
  current: TimeWindow,
  previous: TimeWindow,
  bucket: 'day' | 'month',
  bucketCount: number,
) => {
  const [facet] = await VendorOrderModel.aggregate<{
    currentTotals: TotalsRow[];
    previousTotals: TotalsRow[];
    series: Array<{ _id: string; grossSales: number; netEarnings: number; orders: number }>;
    statusBreakdown: Array<{ _id: string; count: number }>;
    topProducts: Array<{
      _id: Types.ObjectId;
      name: string;
      unitsSold: number;
      grossSales: number;
    }>;
    windowStatusCounts: Array<{ _id: string; count: number }>;
  }>([
    {
      $match: {
        storeId,
        createdAt: { $gte: previous.start, $lt: current.end },
      },
    },
    {
      $facet: {
        currentTotals: [
          {
            $match: {
              createdAt: { $gte: current.start, $lt: current.end },
              ...revenueStatusMatch,
            },
          },
          totalsGroupStage,
        ],
        previousTotals: [
          {
            $match: {
              createdAt: { $gte: previous.start, $lt: previous.end },
              ...revenueStatusMatch,
            },
          },
          totalsGroupStage,
        ],
        series: [
          {
            $match: {
              createdAt: { $gte: current.start, $lt: current.end },
              ...revenueStatusMatch,
            },
          },
          {
            $group: {
              _id: dateGroupId(bucket),
              grossSales: { $sum: '$itemsSubtotal' },
              netEarnings: { $sum: netEarningsExpression },
              orders: { $sum: 1 },
            },
          },
        ],
        statusBreakdown: [
          {
            $match: {
              createdAt: { $gte: current.start, $lt: current.end },
            },
          },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ],
        topProducts: [
          {
            $match: {
              createdAt: { $gte: current.start, $lt: current.end },
              ...revenueStatusMatch,
            },
          },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.productId',
              name: { $first: '$items.productName' },
              unitsSold: { $sum: '$items.quantity' },
              grossSales: { $sum: '$items.lineTotal' },
            },
          },
          { $sort: { grossSales: -1 } },
          { $limit: TOP_PRODUCTS_LIMIT },
        ],
        windowStatusCounts: [
          {
            $match: {
              createdAt: { $gte: current.start, $lt: current.end },
            },
          },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ],
      },
    },
  ]);

  const currentTotals = readTotals(facet?.currentTotals);
  const previousTotals = readTotals(facet?.previousTotals);

  const series = fillSeries(current, {
    bucket,
    bucketCount,
    timezone: ANALYTICS_TIMEZONE,
    rows: (facet?.series ?? []).map((row) => ({
      key: row._id,
      values: {
        grossSales: money(row.grossSales),
        netEarnings: money(row.netEarnings),
        orders: row.orders,
      },
    })),
    defaults: { grossSales: 0, netEarnings: 0, orders: 0 },
  });

  return {
    currentTotals,
    previousTotals,
    series,
    statusBreakdown: (facet?.statusBreakdown ?? []).map((row) => ({
      status: row._id,
      count: row.count,
    })),
    topProductsRaw: facet?.topProducts ?? [],
    windowStatusCounts: facet?.windowStatusCounts ?? [],
  };
};

const sumStatusCounts = (
  rows: Array<{ _id: string; count: number }>,
  statuses: readonly string[],
) => rows.reduce((sum, row) => (statuses.includes(row._id) ? sum + row.count : sum), 0);

const aggregateOrderQueues = async (storeId: Types.ObjectId) => {
  const rows = await VendorOrderModel.aggregate<{ _id: string; count: number }>([
    { $match: { storeId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  return {
    actionNeeded: sumStatusCounts(rows, ORDER_QUEUE_ACTION_NEEDED),
    inProgress: sumStatusCounts(rows, ORDER_QUEUE_IN_PROGRESS),
    shipped: sumStatusCounts(rows, ORDER_QUEUE_SHIPPED),
    delivered: sumStatusCounts(rows, ORDER_QUEUE_DELIVERED),
  };
};

const countReturnsInWindow = (storeId: Types.ObjectId, window: TimeWindow) =>
  ReturnRequestModel.countDocuments({
    createdAt: { $gte: window.start, $lt: window.end },
    $or: [{ storeId }, { 'lines.storeId': storeId }],
  });

const loadStoreReviews = async (
  storeId: Types.ObjectId,
  current: TimeWindow,
  productIds: Types.ObjectId[],
) => {
  if (productIds.length === 0) {
    return {
      average: null as number | null,
      total: 0,
      newInRange: 0,
      distribution: [
        { rating: 1 as const, count: 0 },
        { rating: 2 as const, count: 0 },
        { rating: 3 as const, count: 0 },
        { rating: 4 as const, count: 0 },
        { rating: 5 as const, count: 0 },
      ],
    };
  }

  const [stats] = await ReviewModel.aggregate<{
    total: number;
    sum: number;
    newInRange: number;
    star1: number;
    star2: number;
    star3: number;
    star4: number;
    star5: number;
  }>([
    { $match: { productId: { $in: productIds }, parentId: null } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        sum: { $sum: '$rating' },
        newInRange: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ['$createdAt', current.start] },
                  { $lt: ['$createdAt', current.end] },
                ],
              },
              1,
              0,
            ],
          },
        },
        star1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        star2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        star3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        star4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        star5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
      },
    },
  ]);

  const total = stats?.total ?? 0;
  const average = total > 0 ? Math.round(((stats?.sum ?? 0) / total) * 10) / 10 : null;

  return {
    average,
    total,
    newInRange: stats?.newInRange ?? 0,
    distribution: [
      { rating: 1 as const, count: stats?.star1 ?? 0 },
      { rating: 2 as const, count: stats?.star2 ?? 0 },
      { rating: 3 as const, count: stats?.star3 ?? 0 },
      { rating: 4 as const, count: stats?.star4 ?? 0 },
      { rating: 5 as const, count: stats?.star5 ?? 0 },
    ],
  };
};

const loadLowStock = async (vendorUserId: string) => {
  const result = await inventoryService.listVariants(
    { id: vendorUserId, role: 'vendor' },
    {
      page: 1,
      limit: DASHBOARD_LOW_STOCK_LIMIT,
      sort: 'stock',
      lowStockAt: DEFAULT_LOW_STOCK_AT,
      stockLevel: 'low_stock',
    },
  );

  return {
    items: result.items.map((variant) => ({
      productId: variant.product.id,
      variantId: variant.id,
      name: variant.product.name,
      sku: variant.sku,
      stock: variant.stock,
    })),
    total: result.total,
  };
};

const buildFulfillment = (
  windowStatusCounts: Array<{ _id: string; count: number }>,
  returnCount: number,
) => {
  const total = windowStatusCounts.reduce((sum, row) => sum + row.count, 0);
  const rate = (count: number) => (total > 0 ? money((count / total) * 100) : 0);

  const cancelled = sumStatusCounts(windowStatusCounts, FULFILLMENT_CANCELLED);
  const warehouseRejected = sumStatusCounts(windowStatusCounts, FULFILLMENT_WAREHOUSE_REJECTED);
  const delivered = sumStatusCounts(windowStatusCounts, FULFILLMENT_DELIVERED);

  return {
    cancellationRate: rate(cancelled),
    warehouseRejectionRate: rate(warehouseRejected),
    deliveryRate: rate(delivered),
    returnRate: delivered > 0 ? money((returnCount / delivered) * 100) : 0,
  };
};

const buildTopProducts = (
  rows: Array<{
    _id: Types.ObjectId;
    name: string;
    unitsSold: number;
    grossSales: number;
  }>,
  totalGross: number,
) =>
  rows.map((row) => ({
    productId: String(row._id),
    name: row.name,
    unitsSold: row.unitsSold,
    grossSales: money(row.grossSales),
    sharePercent: totalGross > 0 ? money((row.grossSales / totalGross) * 100) : 0,
  }));

const buildKpis = (current: TotalsRow, previous: TotalsRow) => ({
  grossSales: periodMetric(current.grossSales, previous.grossSales),
  netEarnings: periodMetric(current.netEarnings, previous.netEarnings),
  orders: periodMetric(current.orders, previous.orders),
  averageOrderValue: periodMetric(
    averageOrderValue(current.grossSales, current.orders),
    averageOrderValue(previous.grossSales, previous.orders),
  ),
  unitsSold: periodMetric(current.unitsSold, previous.unitsSold),
  commission: periodMetric(current.commission, previous.commission),
});

export const vendorDashboardService = {
  async overview(
    vendorUserId: string,
    range: VendorDashboardRange,
  ): Promise<VendorDashboardOverview> {
    const store = await storeService.getMine(vendorUserId);
    const storeOid = new Types.ObjectId(store.id);
    const days = VENDOR_RANGE_DAYS[range];
    const { current, previous } = getWindowsForDays(days);

    const [orderMetrics, orderQueues, wallet, lowStock, storeRow, recentOrdersRaw] =
      await Promise.all([
        aggregateOrderMetrics(storeOid, current, previous, 'day', days),
        aggregateOrderQueues(storeOid),
        walletService.getStoreBalances(store.id),
        loadLowStock(vendorUserId),
        StoreModel.findById(store.id).select('ratingAverage ratingCount').lean(),
        VendorOrderModel.find({ storeId: storeOid })
          .sort({ createdAt: -1 })
          .limit(RECENT_ORDERS_LIMIT)
          .select('vendorOrderNumber createdAt itemsSubtotal status items')
          .lean(),
      ]);

    const salesSeries = orderMetrics.series.map((point) => ({
      date: point.date,
      grossSales: point.grossSales,
      orders: point.orders,
    }));

    const { currentTotals, previousTotals } = orderMetrics;

    return {
      range,
      generatedAt: new Date().toISOString(),
      kpis: {
        grossSales: periodMetric(currentTotals.grossSales, previousTotals.grossSales),
        netEarnings: periodMetric(currentTotals.netEarnings, previousTotals.netEarnings),
        orders: periodMetric(currentTotals.orders, previousTotals.orders),
        averageOrderValue: periodMetric(
          averageOrderValue(currentTotals.grossSales, currentTotals.orders),
          averageOrderValue(previousTotals.grossSales, previousTotals.orders),
        ),
      },
      salesSeries,
      orderQueues,
      wallet: {
        availableBalance: money(wallet.availableBalance),
        pendingSettlement: money(wallet.pendingSettlement),
      },
      lowStock: lowStock.items,
      lowStockCount: lowStock.total,
      rating: {
        average: storeRow?.ratingCount ? storeRow.ratingAverage : null,
        count: storeRow?.ratingCount ?? 0,
      },
      recentOrders: recentOrdersRaw.map((order) => ({
        id: String(order._id),
        vendorOrderNumber: order.vendorOrderNumber,
        createdAt: order.createdAt.toISOString(),
        itemsSubtotal: money(order.itemsSubtotal),
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        status: order.status,
      })),
    };
  },

  async analytics(vendorUserId: string, range: VendorAnalyticsRange): Promise<VendorAnalytics> {
    const store = await storeService.getMine(vendorUserId);
    const storeOid = new Types.ObjectId(store.id);
    const windowConfig = resolveAnalyticsWindow(range);

    const productIds = (await ProductModel.find({ storeId: storeOid }).select('_id').lean()).map(
      (product) => product._id,
    );

    const [orderMetrics, returnCount, reviews] = await Promise.all([
      aggregateOrderMetrics(
        storeOid,
        windowConfig.current,
        windowConfig.previous,
        windowConfig.bucket,
        windowConfig.bucketCount,
      ),
      countReturnsInWindow(storeOid, windowConfig.current),
      loadStoreReviews(storeOid, windowConfig.current, productIds),
    ]);

    const kpis = buildKpis(orderMetrics.currentTotals, orderMetrics.previousTotals);

    return {
      range,
      bucket: windowConfig.bucket,
      generatedAt: new Date().toISOString(),
      kpis,
      series: orderMetrics.series,
      statusBreakdown: orderMetrics.statusBreakdown,
      fulfillment: buildFulfillment(orderMetrics.windowStatusCounts, returnCount),
      topProducts: buildTopProducts(
        orderMetrics.topProductsRaw,
        orderMetrics.currentTotals.grossSales,
      ),
      reviews,
    };
  },
};
