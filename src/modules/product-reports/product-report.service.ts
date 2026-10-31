import { Types } from 'mongoose';

import type { UserRole } from '../auth/types';
import { ProductReportModel } from './product-report.model';
import { ProductModel } from '../products/product.model';
import { StoreModel } from '../stores/store.model';
import { AppError } from '../../common/errors/AppError';
import { isDuplicateKeyError } from '../../common/errors/mongoError';
import { mapProductReport, mapProductReports } from './product-report.mapper';
import type {
  CreateProductReportInput,
  ListProductReportsQuery,
  UpdateProductReportStatusInput,
} from './product-report.validator';
import type { ProductReportListPayload, ProductReportMinePayload } from './types';

const isStoreListed = (store: { isActive: boolean; suspendedAt?: Date | null } | null) =>
  Boolean(store?.isActive && !store.suspendedAt);

const isProductListed = (product: {
  approvalStatus: string;
  status: string;
  isPublished: boolean;
}) => product.approvalStatus === 'approved' && product.status === 'active' && product.isPublished;

const toObjectId = (value: string) => new Types.ObjectId(value);

const assertListedProduct = async (productId: string) => {
  const product = await ProductModel.findById(productId)
    .select('approvalStatus status isPublished storeId name slug')
    .lean();

  if (!product) {
    throw AppError.notFound('Product not found');
  }

  const store = await StoreModel.findById(product.storeId).select('isActive suspendedAt').lean();

  if (!isProductListed(product) || !isStoreListed(store)) {
    throw AppError.notFound('Product not found');
  }

  return product;
};

const resolveVendorStoreId = async (userId: string) => {
  const store = await StoreModel.findOne({ userId }).select('_id').lean();

  if (!store) {
    return null;
  }

  return String(store._id);
};

const create = async (productId: string, reporterId: string, input: CreateProductReportInput) => {
  const product = await assertListedProduct(productId);

  try {
    const report = await ProductReportModel.create({
      productId,
      storeId: product.storeId,
      reporterId,
      type: input.type,
      message: input.message,
      status: 'open',
    });

    const mapped = await mapProductReport(report.toObject(), reporterId);

    return { report: mapped! };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw AppError.conflict('You already reported this product');
    }

    throw error;
  }
};

const getMine = async (
  productId: string,
  reporterId: string,
): Promise<ProductReportMinePayload> => {
  await assertListedProduct(productId);

  const report = await ProductReportModel.findOne({
    productId,
    reporterId,
    status: 'open',
  }).lean();

  if (!report) {
    return { report: null };
  }

  const mapped = await mapProductReport(report, reporterId);

  return { report: mapped };
};

const list = async (
  role: UserRole,
  userId: string,
  query: ListProductReportsQuery,
): Promise<{ payload: ProductReportListPayload; total: number }> => {
  const filter: Record<string, unknown> = {};

  if (query.status) {
    filter.status = query.status;
  }

  if (role === 'vendor') {
    const storeId = await resolveVendorStoreId(userId);

    if (!storeId) {
      return { payload: { reports: [] }, total: 0 };
    }

    filter.storeId = toObjectId(storeId);
  } else if (role !== 'admin') {
    throw AppError.forbidden('You do not have permission to perform this action');
  }

  const skip = (query.page - 1) * query.limit;

  const [total, rows] = await Promise.all([
    ProductReportModel.countDocuments(filter),
    ProductReportModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
  ]);

  return {
    payload: {
      reports: await mapProductReports(rows, userId),
    },
    total,
  };
};

const updateStatus = async (reportId: string, input: UpdateProductReportStatusInput) => {
  const report = await ProductReportModel.findById(reportId).lean();

  if (!report) {
    throw AppError.notFound('Report not found');
  }

  if (report.status !== 'open') {
    throw AppError.conflict('Only an open report can be updated');
  }

  const updated = await ProductReportModel.findByIdAndUpdate(
    reportId,
    { $set: { status: input.status } },
    { new: true },
  ).lean();

  if (!updated) {
    throw AppError.notFound('Report not found');
  }

  const mapped = await mapProductReport(updated);

  return { report: mapped! };
};

export const productReportService = {
  create,
  getMine,
  list,
  updateStatus,
};
