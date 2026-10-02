import type { UserRole } from '../types/auth';

export const Permission = {
  productRead: 'product:read',
  dealRead: 'deal:read',
  orderCreate: 'order:create',
  orderReadOwn: 'order:read:own',
  productManage: 'product:manage',
  discountManage: 'discount:manage',
  financeRead: 'finance:read',
  categoryManage: 'category:manage',
  attributeManage: 'attribute:manage',
  userManage: 'user:manage',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const ALL_PERMISSIONS = Object.values(Permission);

const CUSTOMER_PERMISSIONS = [
  Permission.productRead,
  Permission.dealRead,
  Permission.orderCreate,
  Permission.orderReadOwn,
] as const satisfies readonly Permission[];

const VENDOR_PERMISSIONS = [
  Permission.productRead,
  Permission.productManage,
  Permission.discountManage,
  Permission.financeRead,
] as const satisfies readonly Permission[];

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  customer: new Set(CUSTOMER_PERMISSIONS),
  vendor: new Set(VENDOR_PERMISSIONS),
  admin: new Set(ALL_PERMISSIONS),
};

export const roleHasPermission = (role: UserRole, permission: Permission) =>
  ROLE_PERMISSIONS[role].has(permission);
