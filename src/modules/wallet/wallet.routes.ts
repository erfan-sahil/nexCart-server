import { Router } from 'express';
import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { commissionPermissions, walletController, walletPermissions } from './wallet.controller';
import {
  listVendorEarningsQuerySchema,
  listWalletTransactionsQuerySchema,
  releaseStoreSettlementBodySchema,
  storeCommissionBodySchema,
  storeCommissionParamsSchema,
  updateCommissionSettingsSchema,
} from './wallet.validator';

export const vendorWalletRouter = Router();

vendorWalletRouter.get(
  '/balances',
  ...requirePermissions(walletPermissions.vendorBalances),
  walletController.getVendorBalances,
);

vendorWalletRouter.get(
  '/transactions',
  ...requirePermissions(walletPermissions.vendorTransactions),
  validate({ query: listWalletTransactionsQuerySchema }),
  walletController.listVendorTransactions,
);

export const adminCommissionRouter = Router();

adminCommissionRouter.get(
  '/settings',
  ...requirePermissions(commissionPermissions.settings),
  walletController.getCommissionSettings,
);

adminCommissionRouter.put(
  '/settings',
  ...requirePermissions(commissionPermissions.settings),
  validate({ body: updateCommissionSettingsSchema }),
  walletController.updateCommissionSettings,
);

adminCommissionRouter.patch(
  '/stores/:storeId',
  ...requirePermissions(commissionPermissions.settings),
  validate({ params: storeCommissionParamsSchema, body: storeCommissionBodySchema }),
  walletController.setStoreCommission,
);

adminCommissionRouter.post(
  '/stores/:storeId/release-settlement',
  ...requirePermissions(commissionPermissions.settings),
  validate({ params: storeCommissionParamsSchema, body: releaseStoreSettlementBodySchema }),
  walletController.releaseStoreSettlement,
);

adminCommissionRouter.get(
  '/vendor-earnings',
  ...requirePermissions(commissionPermissions.vendorEarnings),
  validate({ query: listVendorEarningsQuerySchema }),
  walletController.listVendorEarnings,
);
