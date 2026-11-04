import { Types } from 'mongoose';
import { SiteSettingsModel } from '../site-settings/site-settings.model';
import { SITE_SETTINGS_KEY } from '../site-settings/constants';
import { StoreModel } from '../stores/store.model';
import { AppError } from '../../common/errors/AppError';
import { walletService } from './wallet.service';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const commissionAdminService = {
  async getSettings() {
    const record = await SiteSettingsModel.findOne({ key: SITE_SETTINGS_KEY }).select(
      'defaultCommissionRate settlementHoldDays',
    );

    return {
      defaultCommissionRate: record?.defaultCommissionRate ?? 10,
      settlementHoldDays: record?.settlementHoldDays ?? 7,
    };
  },

  async updateSettings(input: { defaultCommissionRate: number; settlementHoldDays: number }) {
    const record = await SiteSettingsModel.findOneAndUpdate(
      { key: SITE_SETTINGS_KEY },
      {
        $set: {
          defaultCommissionRate: input.defaultCommissionRate,
          settlementHoldDays: input.settlementHoldDays,
        },
        $setOnInsert: { key: SITE_SETTINGS_KEY },
      },
      { upsert: true, new: true, runValidators: true },
    );

    return {
      defaultCommissionRate: record.defaultCommissionRate,
      settlementHoldDays: record.settlementHoldDays,
    };
  },

  async setStoreCommissionRate(storeId: string, commissionRate: number | null) {
    if (!Types.ObjectId.isValid(storeId)) {
      throw AppError.notFound('Store not found');
    }

    const store = await StoreModel.findByIdAndUpdate(
      storeId,
      { $set: { commissionRate } },
      { new: true },
    ).select('_id name commissionRate');

    if (!store) {
      throw AppError.notFound('Store not found');
    }

    return {
      storeId: String(store._id),
      storeName: store.name,
      commissionRate: store.commissionRate,
    };
  },

  async listVendorEarnings(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const filter = { isActive: true };

    const [stores, total, settings] = await Promise.all([
      StoreModel.find(filter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .select('_id name commissionRate'),
      StoreModel.countDocuments(filter),
      SiteSettingsModel.findOne({ key: SITE_SETTINGS_KEY }).select('defaultCommissionRate'),
    ]);

    const defaultCommissionRate = settings?.defaultCommissionRate ?? 10;

    const items = await Promise.all(
      stores.map(async (store) => {
        const balances = await walletService.getStoreBalances(String(store._id));
        const hasOverride = store.commissionRate !== null && store.commissionRate !== undefined;

        return {
          storeId: String(store._id),
          storeName: store.name,
          commissionRate: hasOverride ? store.commissionRate : null,
          effectiveCommissionRate: hasOverride ? store.commissionRate : defaultCommissionRate,
          hasOverride,
          pendingSettlement: balances.pendingSettlement,
          availableBalance: balances.availableBalance,
          withdrawnBalance: money(0),
        };
      }),
    );

    return { items, page, limit, total };
  },
};
