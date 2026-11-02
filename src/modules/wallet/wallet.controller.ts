import type { Request, Response } from 'express';
import { Permission } from '../../common/constants/permissions';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendPaginated, sendSuccess } from '../../common/http/sendResponse';
import { AppError } from '../../common/errors/AppError';
import { storeService } from '../stores/store.service';
import { commissionAdminService } from './commission-admin.service';
import { walletService } from './wallet.service';
import type {
  ListVendorEarningsQuery,
  ListWalletTransactionsQuery,
  StoreCommissionBody,
  UpdateCommissionSettingsInput,
} from './wallet.validator';

const vendorUserId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const vendorStoreId = async (req: Request) => {
  const store = await storeService.getMine(vendorUserId(req));
  return store.id;
};

const getVendorBalances = asyncHandler(async (req: Request, res: Response) => {
  const storeId = await vendorStoreId(req);
  const balances = await walletService.getStoreBalances(storeId);

  sendSuccess(res, {
    storeId,
    ...balances,
    withdrawnBalance: 0,
  });
});

const listVendorTransactions = asyncHandler(async (req: Request, res: Response) => {
  const storeId = await vendorStoreId(req);
  const query = req.query as unknown as ListWalletTransactionsQuery;
  const result = await walletService.listForStore(storeId, query.page, query.limit);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const getCommissionSettings = asyncHandler(async (_req: Request, res: Response) => {
  const data = await commissionAdminService.getSettings();
  sendSuccess(res, data);
});

const updateCommissionSettings = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateCommissionSettingsInput;
  const data = await commissionAdminService.updateSettings(body);
  sendSuccess(res, data, { message: 'Commission settings updated' });
});

const setStoreCommission = asyncHandler(async (req: Request, res: Response) => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const body = req.body as StoreCommissionBody;
  const data = await commissionAdminService.setStoreCommissionRate(
    storeId ?? '',
    body.commissionRate,
  );

  sendSuccess(res, data, { message: 'Store commission updated' });
});

const listVendorEarnings = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListVendorEarningsQuery;
  const result = await commissionAdminService.listVendorEarnings(query.page, query.limit);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

export const walletPermissions = {
  vendorBalances: Permission.vendorAnalytics,
  vendorTransactions: Permission.vendorAnalytics,
} as const;

export const commissionPermissions = {
  settings: Permission.adminCommission,
  vendorEarnings: Permission.adminCommission,
} as const;

export const walletController = {
  getVendorBalances,
  listVendorTransactions,
  getCommissionSettings,
  updateCommissionSettings,
  setStoreCommission,
  listVendorEarnings,
};
