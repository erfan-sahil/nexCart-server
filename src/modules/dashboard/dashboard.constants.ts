export const DASHBOARD_RANGES = ['7d', '30d', '90d'] as const;

export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export const DASHBOARD_RANGE_DAYS: Record<DashboardRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export const VENDOR_APPLICATION_REVIEW_STATUSES = ['submitted', 'under_review'] as const;

export const PRODUCT_APPROVAL_QUEUE_STATUSES = ['pending', 'submitted'] as const;

export const RETURN_TERMINAL_STATUSES = [
  'refunded',
  'closed_without_refund',
  'rejected',
  'damaged',
  'inspection_rejected',
] as const;

export const COD_OUTSTANDING_REMITTANCE_STATUSES = [
  'expected',
  'collected',
  'remitted',
  'short',
] as const;

export const DASHBOARD_QUEUE_PATHS = {
  vendorApplications: '/users/vendor-applications',
  productApprovals: '/catalog/product-approvals',
  productReports: '/moderation/reports',
  returns: '/commerce/returns',
  withdrawals: '/finance/withdrawals',
  codOrders: '/commerce/orders',
} as const;
