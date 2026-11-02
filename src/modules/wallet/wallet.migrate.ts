import { logger } from '../../common/utils/logger';
import { OrderModel } from '../orders/order.model';
import { VendorOrderModel } from '../orders/vendor-order.model';
import { SiteSettingsModel } from '../site-settings/site-settings.model';
import { SITE_SETTINGS_KEY } from '../site-settings/constants';
import { walletService } from './wallet.service';

export const migrateWalletSnapshots = async () => {
  await SiteSettingsModel.updateOne(
    { key: SITE_SETTINGS_KEY },
    {
      $setOnInsert: {
        key: SITE_SETTINGS_KEY,
        defaultCommissionRate: 10,
        settlementHoldDays: 7,
      },
    },
    { upsert: true },
  );

  const pending = await VendorOrderModel.find({ commissionRate: null }).select('_id').limit(200);

  for (const row of pending) {
    await walletService.applyCommissionSnapshot(row._id);
  }

  if (pending.length > 0) {
    logger.info(`Wallet snapshot backfill processed ${pending.length} vendor orders`);
  }

  await OrderModel.updateMany(
    {
      paymentMethod: 'cod',
      paymentStatus: 'paid',
      codRemittanceStatus: { $nin: ['reconciled'] },
    },
    { $set: { codRemittanceStatus: 'reconciled' } },
  );
};
