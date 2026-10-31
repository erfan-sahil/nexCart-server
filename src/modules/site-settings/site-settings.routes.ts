import { Router } from 'express';
import { Permission } from '../../constants/permissions';
import { requirePermissions } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { siteSettingsController } from './site-settings.controller';
import { updateSiteSettingsSchema } from './site-settings.validator';

export const siteSettingsRouter = Router();

siteSettingsRouter.get('/', siteSettingsController.getSettings);

siteSettingsRouter.put(
  '/',
  ...requirePermissions(Permission.adminPlatformSettings),
  validate({ body: updateSiteSettingsSchema }),
  siteSettingsController.updateSettings,
);
