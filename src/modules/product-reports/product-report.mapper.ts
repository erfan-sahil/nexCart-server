import type { Types } from 'mongoose';

import type { ProductReport } from './product-report.model';
import { ProductModel } from '../products/product.model';
import { StoreModel } from '../stores/store.model';
import { UserModel } from '../users/user.model';
import type { ProductReportDto } from './types';

type ReportLean = Pick<
  ProductReport,
  | '_id'
  | 'productId'
  | 'storeId'
  | 'reporterId'
  | 'type'
  | 'message'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
>;

type ProductRow = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
};

type StoreRow = {
  _id: Types.ObjectId;
  name: string;
};

type UserRow = {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
};

const displayName = (user: Pick<UserRow, 'firstName' | 'lastName'>) =>
  `${user.firstName} ${user.lastName}`.trim();

export const mapProductReports = async (
  rows: ReportLean[],
  viewerId?: string,
): Promise<ProductReportDto[]> => {
  if (rows.length === 0) {
    return [];
  }

  const productIds = [...new Set(rows.map((row) => String(row.productId)))];
  const storeIds = [...new Set(rows.map((row) => String(row.storeId)))];
  const reporterIds = [...new Set(rows.map((row) => String(row.reporterId)))];

  const [products, stores, reporters] = await Promise.all([
    ProductModel.find({ _id: { $in: productIds } })
      .select('name slug')
      .lean<ProductRow[]>(),
    StoreModel.find({ _id: { $in: storeIds } })
      .select('name')
      .lean<StoreRow[]>(),
    UserModel.find({ _id: { $in: reporterIds } })
      .select('firstName lastName')
      .lean<UserRow[]>(),
  ]);

  const productMap = new Map(products.map((row) => [String(row._id), row]));
  const storeMap = new Map(stores.map((row) => [String(row._id), row]));
  const reporterMap = new Map(reporters.map((row) => [String(row._id), row]));

  return rows.map((row) => {
    const product = productMap.get(String(row.productId));
    const store = storeMap.get(String(row.storeId));
    const reporter = reporterMap.get(String(row.reporterId));

    return {
      id: String(row._id),
      type: row.type,
      message: row.message,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      product: {
        id: String(row.productId),
        name: product?.name ?? 'Unknown product',
        slug: product?.slug ?? '',
      },
      store: {
        id: String(row.storeId),
        name: store?.name ?? 'Unknown store',
      },
      reporter: {
        id: String(row.reporterId),
        displayName: reporter ? displayName(reporter) : 'Unknown user',
      },
      isMine: viewerId ? String(row.reporterId) === viewerId : false,
    };
  });
};

export const mapProductReport = async (row: ReportLean, viewerId?: string) => {
  const [mapped] = await mapProductReports([row], viewerId);
  return mapped ?? null;
};
