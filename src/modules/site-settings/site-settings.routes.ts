import { Router } from 'express';
import { Permission } from '../../common/constants/permissions';
import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
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
