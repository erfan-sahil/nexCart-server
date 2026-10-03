import type { UserRole } from '../types/auth';

export const Permission = {
  adminCategories: 'admin:categories',
  adminAttributes: 'admin:attributes',
  adminUnits: 'admin:units',
  adminBrands: 'admin:brands',
  adminCatalog: 'admin:catalog',
  adminVendorApprovals: 'admin:vendor-approvals',
  adminProductModeration: 'admin:product-moderation',
  adminOrders: 'admin:orders',
  adminCoupons: 'admin:coupons',
  adminPromotions: 'admin:promotions',
  adminCommission: 'admin:commission',
  adminPlatformSettings: 'admin:platform-settings',

  vendorStore: 'vendor:store',
  vendorProducts: 'vendor:products',
  vendorVariants: 'vendor:variants',
  vendorInventory: 'vendor:inventory',
  vendorPricing: 'vendor:pricing',
  vendorOrders: 'vendor:orders',
  vendorShipping: 'vendor:shipping',
  vendorCoupons: 'vendor:coupons',
  vendorAnalytics: 'vendor:analytics',

  customerBrowseCategories: 'customer:browse-categories',
  customerSearch: 'customer:search',
  customerFilter: 'customer:filter',
  customerProduct: 'customer:product',
  customerStore: 'customer:store',
  customerCart: 'customer:cart',
  customerCheckout: 'customer:checkout',
  customerPayment: 'customer:payment',
  customerOrders: 'customer:orders',
  customerTracking: 'customer:tracking',
  customerReviews: 'customer:reviews',
  customerWishlist: 'customer:wishlist',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const ADMIN_PERMISSIONS = [
  Permission.adminCategories,
  Permission.adminAttributes,
  Permission.adminUnits,
  Permission.adminBrands,
  Permission.adminCatalog,
  Permission.adminVendorApprovals,
  Permission.adminProductModeration,
  Permission.adminOrders,
  Permission.adminCoupons,
  Permission.adminPromotions,
  Permission.adminCommission,
  Permission.adminPlatformSettings,
] as const satisfies readonly Permission[];

const VENDOR_PERMISSIONS = [
  Permission.vendorStore,
  Permission.vendorProducts,
  Permission.vendorVariants,
  Permission.vendorInventory,
  Permission.vendorPricing,
  Permission.vendorOrders,
  Permission.vendorShipping,
  Permission.vendorCoupons,
  Permission.vendorAnalytics,
] as const satisfies readonly Permission[];

const CUSTOMER_PERMISSIONS = [
  Permission.customerBrowseCategories,
  Permission.customerSearch,
  Permission.customerFilter,
  Permission.customerProduct,
  Permission.customerStore,
  Permission.customerCart,
  Permission.customerCheckout,
  Permission.customerPayment,
  Permission.customerOrders,
  Permission.customerTracking,
  Permission.customerReviews,
  Permission.customerWishlist,
] as const satisfies readonly Permission[];

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  admin: new Set(ADMIN_PERMISSIONS),
  vendor: new Set(VENDOR_PERMISSIONS),
  customer: new Set(CUSTOMER_PERMISSIONS),
};

export const roleHasPermission = (role: UserRole, permission: Permission) =>
  ROLE_PERMISSIONS[role].has(permission);
