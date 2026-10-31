import { env } from '../../config/env';
import { SiteSettingsModel } from '../../models/siteSettings.model';
import { ORDER_CURRENCY } from '../orders/constants';
import { SITE_SETTINGS_KEY } from './constants';
import type { SiteSettingsDto } from './types';
import type { UpdateSiteSettingsInput } from './site-settings.validator';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const currency = () => env.ORDER_CURRENCY || ORDER_CURRENCY;

export const defaultSiteSettings = (): SiteSettingsDto => ({
  deliveryFee: money(env.ORDER_DELIVERY_FEE),
  freeDeliveryEnabled: false,
  freeDeliveryMinAmount: 0,
  currency: currency(),
});

const toDto = (record: {
  deliveryFee: number;
  freeDeliveryEnabled: boolean;
  freeDeliveryMinAmount: number;
}): SiteSettingsDto => ({
  deliveryFee: money(record.deliveryFee),
  freeDeliveryEnabled: record.freeDeliveryEnabled,
  freeDeliveryMinAmount: money(record.freeDeliveryMinAmount),
  currency: currency(),
});

export const deliveryFeeFor = (
  itemsSubtotal: number,
  settings: Pick<SiteSettingsDto, 'deliveryFee' | 'freeDeliveryEnabled' | 'freeDeliveryMinAmount'>,
) => {
  const subtotal = money(itemsSubtotal);

  if (settings.freeDeliveryEnabled && subtotal >= money(settings.freeDeliveryMinAmount)) {
    return 0;
  }

  return money(settings.deliveryFee);
};

export const siteSettingsService = {
  async get(): Promise<SiteSettingsDto> {
    const record = await SiteSettingsModel.findOne({ key: SITE_SETTINGS_KEY }).select(
      'deliveryFee freeDeliveryEnabled freeDeliveryMinAmount',
    );

    if (!record) {
      return defaultSiteSettings();
    }

    return toDto(record);
  },

  async update(input: UpdateSiteSettingsInput): Promise<SiteSettingsDto> {
    const record = await SiteSettingsModel.findOneAndUpdate(
      { key: SITE_SETTINGS_KEY },
      {
        $set: {
          deliveryFee: money(input.deliveryFee),
          freeDeliveryEnabled: input.freeDeliveryEnabled,
          freeDeliveryMinAmount: money(input.freeDeliveryMinAmount),
        },
        $setOnInsert: { key: SITE_SETTINGS_KEY },
      },
      { upsert: true, new: true, runValidators: true },
    );

    return toDto(record);
  },
};
