import type { VendorAnalyticsRange, VendorDashboardRange } from './vendor-dashboard.constants';

export type VendorPeriodMetric = {
  current: number;
  previous: number;
  changePercent: number | null;
};

export type VendorDashboardOverview = {
  range: VendorDashboardRange;
  generatedAt: string;
  kpis: {
    grossSales: VendorPeriodMetric;
    netEarnings: VendorPeriodMetric;
    orders: VendorPeriodMetric;
    averageOrderValue: VendorPeriodMetric;
  };
  salesSeries: { date: string; grossSales: number; orders: number }[];
  orderQueues: {
    actionNeeded: number;
    inProgress: number;
    shipped: number;
    delivered: number;
  };
  wallet: { availableBalance: number; pendingSettlement: number };
  lowStock: {
    productId: string;
    variantId: string;
    name: string;
    sku: string;
    stock: number;
  }[];
  lowStockCount: number;
  rating: { average: number | null; count: number };
  recentOrders: {
    id: string;
    vendorOrderNumber: string;
    createdAt: string;
    itemsSubtotal: number;
    itemCount: number;
    status: string;
  }[];
};

export type VendorAnalytics = {
  range: VendorAnalyticsRange;
  bucket: 'day' | 'month';
  generatedAt: string;
  kpis: {
    grossSales: VendorPeriodMetric;
    netEarnings: VendorPeriodMetric;
    orders: VendorPeriodMetric;
    averageOrderValue: VendorPeriodMetric;
    unitsSold: VendorPeriodMetric;
    commission: VendorPeriodMetric;
  };
  series: {
    date: string;
    grossSales: number;
    netEarnings: number;
    orders: number;
  }[];
  statusBreakdown: { status: string; count: number }[];
  fulfillment: {
    cancellationRate: number;
    warehouseRejectionRate: number;
    deliveryRate: number;
    returnRate: number;
  };
  topProducts: {
    productId: string;
    name: string;
    unitsSold: number;
    grossSales: number;
    sharePercent: number;
  }[];
  reviews: {
    average: number | null;
    total: number;
    newInRange: number;
    distribution: { rating: 1 | 2 | 3 | 4 | 5; count: number }[];
  };
};
