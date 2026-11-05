import { OrderModel } from '../orders/order.model';
import { VendorOrderModel } from '../orders/vendor-order.model';
import { ProductModel } from '../products/product.model';
import { ProductReportModel } from '../product-reports/product-report.model';
import { ReturnRequestModel } from '../returns/return-request.model';
import { StoreModel, listedStoreFilter } from '../stores/store.model';
import { UserModel } from '../users/user.model';
import { VendorApplicationModel } from '../vendor-applications/vendor-application.model';
import { WithdrawalModel } from '../withdrawals/withdrawal.model';
import {
  COD_OUTSTANDING_REMITTANCE_STATUSES,
  DASHBOARD_QUEUE_PATHS,
  DASHBOARD_RANGE_DAYS,
  PRODUCT_APPROVAL_QUEUE_STATUSES,
  RETURN_TERMINAL_STATUSES,
  VENDOR_APPLICATION_REVIEW_STATUSES,
  type DashboardRange,
} from './dashboard.constants';
import type {
  DashboardAttentionQueue,
  DashboardOverview,
  DashboardPeriodMetric,
  DashboardRecentOrder,
  DashboardRecentVendorApplication,
  DashboardSalesPoint,
} from './dashboard.types';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const vendorOrderRevenueMatch = {
  status: { $ne: 'cancelled' as const },
};

type TimeWindow = {
  start: Date;
  end: Date;
};

const getWindows = (
  range: DashboardRange,
): { current: TimeWindow; previous: TimeWindow; days: number } => {
  const days = DASHBOARD_RANGE_DAYS[range];
  const end = new Date();
  const currentStart = new Date(end);
  currentStart.setTime(currentStart.getTime() - days * 24 * 60 * 60 * 1000);

  const previousEnd = new Date(currentStart);
  const previousStart = new Date(previousEnd);
  previousStart.setTime(previousStart.getTime() - days * 24 * 60 * 60 * 1000);

  return {
    current: { start: currentStart, end },
    previous: { start: previousStart, end: previousEnd },
    days,
  };
};

const periodMetric = (current: number, previous: number): DashboardPeriodMetric => {
  const roundedCurrent = money(current);
  const roundedPrevious = money(previous);
  let changePercent: number | null = null;
  if (roundedPrevious !== 0) {
    changePercent = money(((roundedCurrent - roundedPrevious) / roundedPrevious) * 100);
  }
  return {
    current: roundedCurrent,
    previous: roundedPrevious,
    changePercent,
  };
};

const sumVendorOrderRevenue = async (window: TimeWindow) => {
  const [row] = await VendorOrderModel.aggregate<{
    gmv: number;
    commission: number;
  }>([
    {
      $match: {
        ...vendorOrderRevenueMatch,
        createdAt: { $gte: window.start, $lt: window.end },
      },
    },
    {
      $group: {
        _id: null,
        gmv: { $sum: '$itemsSubtotal' },
        commission: { $sum: { $ifNull: ['$commissionAmount', 0] } },
      },
    },
  ]);

  return {
    gmv: row?.gmv ?? 0,
    commission: row?.commission ?? 0,
  };
};

const countOrdersInWindow = (window: TimeWindow) =>
  OrderModel.countDocuments({
    createdAt: { $gte: window.start, $lt: window.end },
  });

const countNewCustomersInWindow = (window: TimeWindow) =>
  UserModel.countDocuments({
    role: 'customer',
    createdAt: { $gte: window.start, $lt: window.end },
  });

const buildSalesSeries = async (
  window: TimeWindow,
  days: number,
): Promise<DashboardSalesPoint[]> => {
  const rows = await VendorOrderModel.aggregate<{ _id: string; gmv: number }>([
    {
      $match: {
        ...vendorOrderRevenueMatch,
        createdAt: { $gte: window.start, $lt: window.end },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' },
        },
        gmv: { $sum: '$itemsSubtotal' },
      },
    },
  ]);

  const byDate = new Map(rows.map((row) => [row._id, money(row.gmv)]));

  const series: DashboardSalesPoint[] = [];
  const cursor = new Date(window.start);
  cursor.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < days; i += 1) {
    const dateKey = cursor.toISOString().slice(0, 10);
    series.push({
      date: dateKey,
      gmv: byDate.get(dateKey) ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return series;
};

const suspendedStoreFilter = {
  $or: [{ isActive: false }, { suspendedAt: { $ne: null } }],
};

export const adminDashboardService = {
  async overview(range: DashboardRange): Promise<DashboardOverview> {
    const windows = getWindows(range);
    const generatedAt = new Date().toISOString();

    const [
      currentRevenue,
      previousRevenue,
      currentOrderCount,
      previousOrderCount,
      currentCustomerCount,
      previousCustomerCount,
      salesSeries,
      customers,
      vendors,
      activeStores,
      suspendedStores,
      publishedProducts,
      vendorApplicationsPending,
      productsPendingApproval,
      openProductReports,
      activeReturns,
      pendingWithdrawals,
      codOrdersOutstanding,
      recentOrdersRaw,
      recentApplicationsRaw,
    ] = await Promise.all([
      sumVendorOrderRevenue(windows.current),
      sumVendorOrderRevenue(windows.previous),
      countOrdersInWindow(windows.current),
      countOrdersInWindow(windows.previous),
      countNewCustomersInWindow(windows.current),
      countNewCustomersInWindow(windows.previous),
      buildSalesSeries(windows.current, windows.days),
      UserModel.countDocuments({ role: 'customer' }),
      UserModel.countDocuments({ role: 'vendor' }),
      StoreModel.countDocuments(listedStoreFilter),
      StoreModel.countDocuments(suspendedStoreFilter),
      ProductModel.countDocuments({ isPublished: true, approvalStatus: 'approved' }),
      VendorApplicationModel.countDocuments({
        status: { $in: [...VENDOR_APPLICATION_REVIEW_STATUSES] },
      }),
      ProductModel.countDocuments({
        approvalStatus: { $in: [...PRODUCT_APPROVAL_QUEUE_STATUSES] },
      }),
      ProductReportModel.countDocuments({ status: 'open' }),
      ReturnRequestModel.countDocuments({
        status: { $nin: [...RETURN_TERMINAL_STATUSES] },
      }),
      WithdrawalModel.countDocuments({ status: 'pending' }),
      OrderModel.countDocuments({
        paymentMethod: 'cod',
        codRemittanceStatus: { $in: [...COD_OUTSTANDING_REMITTANCE_STATUSES] },
      }),
      OrderModel.find()
        .sort({ createdAt: -1 })
        .limit(8)
        .select('orderNumber createdAt grandTotal status paymentStatus')
        .lean(),
      VendorApplicationModel.find({
        status: { $in: [...VENDOR_APPLICATION_REVIEW_STATUSES] },
      })
        .sort({ submittedAt: -1, createdAt: -1 })
        .limit(5)
        .select('status submittedAt business.storeName')
        .lean(),
    ]);

    const attentionQueues: DashboardAttentionQueue[] = [
      {
        key: 'vendorApplications',
        label: 'Vendor applications',
        count: vendorApplicationsPending,
        adminPath: DASHBOARD_QUEUE_PATHS.vendorApplications,
      },
      {
        key: 'productApprovals',
        label: 'Product approvals',
        count: productsPendingApproval,
        adminPath: DASHBOARD_QUEUE_PATHS.productApprovals,
      },
      {
        key: 'productReports',
        label: 'Open product reports',
        count: openProductReports,
        adminPath: DASHBOARD_QUEUE_PATHS.productReports,
      },
      {
        key: 'returns',
        label: 'Active returns',
        count: activeReturns,
        adminPath: DASHBOARD_QUEUE_PATHS.returns,
      },
      {
        key: 'withdrawals',
        label: 'Pending withdrawals',
        count: pendingWithdrawals,
        adminPath: DASHBOARD_QUEUE_PATHS.withdrawals,
      },
      {
        key: 'codOrders',
        label: 'COD remittance outstanding',
        count: codOrdersOutstanding,
        adminPath: DASHBOARD_QUEUE_PATHS.codOrders,
      },
    ];

    const recentOrders: DashboardRecentOrder[] = recentOrdersRaw.map((order) => ({
      id: String(order._id),
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
      grandTotal: money(order.grandTotal),
      status: order.status,
      paymentStatus: order.paymentStatus,
    }));

    const recentVendorApplications: DashboardRecentVendorApplication[] = recentApplicationsRaw.map(
      (application) => ({
        id: String(application._id),
        storeName: application.business?.storeName?.trim() || 'Unnamed store',
        submittedAt: application.submittedAt ? application.submittedAt.toISOString() : null,
        status: application.status,
      }),
    );

    return {
      range,
      generatedAt,
      period: {
        gmv: periodMetric(currentRevenue.gmv, previousRevenue.gmv),
        commission: periodMetric(currentRevenue.commission, previousRevenue.commission),
        orders: periodMetric(currentOrderCount, previousOrderCount),
        newCustomers: periodMetric(currentCustomerCount, previousCustomerCount),
      },
      salesSeries,
      marketplace: {
        customers,
        vendors,
        activeStores,
        suspendedStores,
        publishedProducts,
      },
      attentionQueues,
      recentOrders,
      recentVendorApplications,
    };
  },
};
