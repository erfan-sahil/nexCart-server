/**
 * Vendor dashboard metric definitions
 *
 * - Gross sales: sum of itemsSubtotal for vendor orders whose status is not cancelled.
 * - Net earnings: sum of vendorEarnings, or itemsSubtotal - commissionAmount when null.
 * - Orders: count of vendor orders (non-cancelled for revenue KPIs; all statuses for breakdown).
 * - Average order value (AOV): gross sales / order count.
 * - Fulfillment health: rates of cancelled, warehouse-rejected, delivered, and customer-rejected
 *   orders against the total in the selected window.
 * - Returns rate: return requests in the window divided by delivered orders in the window.
 */

export const VENDOR_DASHBOARD_RANGES = ['7d', '30d'] as const;
export type VendorDashboardRange = (typeof VENDOR_DASHBOARD_RANGES)[number];

export const VENDOR_ANALYTICS_RANGES = ['7d', '30d', '90d', '12m'] as const;
export type VendorAnalyticsRange = (typeof VENDOR_ANALYTICS_RANGES)[number];

export const VENDOR_RANGE_DAYS: Record<Exclude<VendorAnalyticsRange, '12m'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export const ANALYTICS_TIMEZONE = 'Asia/Dhaka';

export const REVENUE_EXCLUDED_STATUSES = ['cancelled'] as const;

export const ORDER_QUEUE_ACTION_NEEDED = ['pending'] as const;
export const ORDER_QUEUE_IN_PROGRESS = [
  'accepted',
  'preparing',
  'partially_accepted',
  'rejected_at_warehouse',
  'sending_to_warehouse',
  'received_at_warehouse',
  'inspecting',
  'accepted_at_warehouse',
  'packed',
] as const;
export const ORDER_QUEUE_SHIPPED = ['shipped', 'out_for_delivery'] as const;
export const ORDER_QUEUE_DELIVERED = ['delivered'] as const;

export const FULFILLMENT_CANCELLED = ['cancelled'] as const;
export const FULFILLMENT_WAREHOUSE_REJECTED = ['rejected_at_warehouse'] as const;
export const FULFILLMENT_DELIVERED = ['delivered'] as const;
export const FULFILLMENT_CUSTOMER_REJECTED = [
  'customer_rejected',
  'partially_rejected',
  'delivery_failed',
] as const;

export const DASHBOARD_LOW_STOCK_LIMIT = 5;
export const TOP_PRODUCTS_LIMIT = 10;
export const RECENT_ORDERS_LIMIT = 5;
