import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendSuccess } from '../../common/http/sendResponse';
import { siteSettingsService } from './site-settings.service';
import type { UpdateSiteSettingsInput } from './site-settings.validator';

const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await siteSettingsService.get();

  sendSuccess(res, settings, { message: 'Site settings fetched' });
});

const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await siteSettingsService.update(req.body as UpdateSiteSettingsInput);

  sendSuccess(res, settings, { message: 'Site settings saved' });
});

export const siteSettingsController = {
  getSettings,
  updateSettings,
};
