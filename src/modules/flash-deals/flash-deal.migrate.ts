import { DEFAULT_FLASH_DEAL_SECTION_TITLE, FLASH_DEAL_SETTINGS_KEY } from './constants';
import {
  FlashDealCampaignModel,
  FlashDealItemModel,
  FlashDealSettingsModel,
  LegacyFlashDealModel,
} from './flash-deal.model';

let migratePromise: Promise<void> | null = null;

const windowKey = (startsAt: Date, endsAt: Date) =>
  `${startsAt.toISOString()}|${endsAt.toISOString()}`;

/**
 * One-time conversion of legacy flat flash deals into campaigns + items.
 * Safe to call repeatedly; no-ops when there is nothing left to migrate.
 */
export const migrateLegacyFlashDeals = async () => {
  if (!migratePromise) {
    migratePromise = (async () => {
      const legacyCount = await LegacyFlashDealModel.estimatedDocumentCount();

      if (legacyCount === 0) {
        return;
      }

      const settings = await FlashDealSettingsModel.findOne({
        key: FLASH_DEAL_SETTINGS_KEY,
      }).lean();
      const baseName = settings?.sectionTitle?.trim() || DEFAULT_FLASH_DEAL_SECTION_TITLE;

      const legacy = await LegacyFlashDealModel.find().sort({ startsAt: 1 }).lean();
      const groups = new Map<
        string,
        {
          startsAt: Date;
          endsAt: Date;
          rows: typeof legacy;
        }
      >();

      for (const deal of legacy) {
        const key = windowKey(deal.startsAt, deal.endsAt);
        const group = groups.get(key);

        if (group) {
          group.rows.push(deal);
        } else {
          groups.set(key, {
            startsAt: deal.startsAt,
            endsAt: deal.endsAt,
            rows: [deal],
          });
        }
      }

      let index = 0;

      for (const group of groups.values()) {
        index += 1;
        const name = groups.size === 1 ? baseName : `${baseName} (${index})`.slice(0, 80);

        const campaign = await FlashDealCampaignModel.create({
          name,
          startsAt: group.startsAt,
          endsAt: group.endsAt,
        });

        const seenProducts = new Set<string>();

        for (const row of group.rows) {
          const productId = String(row.productId);

          if (seenProducts.has(productId)) {
            continue;
          }

          seenProducts.add(productId);

          await FlashDealItemModel.create({
            campaignId: campaign._id,
            productId: row.productId,
            discountType: row.discountType,
            discountValue: row.discountValue,
          });
        }
      }

      await LegacyFlashDealModel.deleteMany({});
    })().catch((error) => {
      migratePromise = null;
      throw error;
    });
  }

  await migratePromise;
};
