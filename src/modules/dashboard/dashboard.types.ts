import type { DashboardRange } from './dashboard.constants';

export type DashboardPeriodMetric = {
  current: number;
  previous: number;
  changePercent: number | null;
};

export type DashboardSalesPoint = {
  date: string;
  gmv: number;
};

export type DashboardAttentionQueue = {
  key: string;
  label: string;
  count: number;
  adminPath: string;
};

export type DashboardMarketplaceSnapshot = {
  customers: number;
  vendors: number;
  activeStores: number;
  suspendedStores: number;
  publishedProducts: number;
};

export type DashboardRecentOrder = {
  id: string;
  orderNumber: string;
  createdAt: string;
  grandTotal: number;
  status: string;
  paymentStatus: string;
};

export type DashboardRecentVendorApplication = {
  id: string;
  storeName: string;
  submittedAt: string | null;
  status: string;
};

export type DashboardOverview = {
  range: DashboardRange;
  generatedAt: string;
  period: {
    gmv: DashboardPeriodMetric;
    commission: DashboardPeriodMetric;
    orders: DashboardPeriodMetric;
    newCustomers: DashboardPeriodMetric;
  };
  salesSeries: DashboardSalesPoint[];
  marketplace: DashboardMarketplaceSnapshot;
  attentionQueues: DashboardAttentionQueue[];
  recentOrders: DashboardRecentOrder[];
  recentVendorApplications: DashboardRecentVendorApplication[];
};
