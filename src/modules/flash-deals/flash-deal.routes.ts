import { Router } from 'express';
import { Permission } from '../../common/constants/permissions';
import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { flashDealController } from './flash-deal.controller';
import {
  createFlashDealSchema,
  flashDealIdParamsSchema,
  listFlashDealsQuerySchema,
  updateFlashDealSchema,
  updateFlashDealSettingsSchema,
} from './flash-deal.validator';

export const flashDealRouter = Router();

flashDealRouter.get('/settings', flashDealController.getSettings);

flashDealRouter.put(
  '/settings',
  ...requirePermissions(Permission.adminPromotions),
  validate({ body: updateFlashDealSettingsSchema }),
  flashDealController.updateSettings,
);

flashDealRouter.get(
  '/manage',
  ...requirePermissions(Permission.adminPromotions),
  validate({ query: listFlashDealsQuerySchema }),
  flashDealController.listManage,
);

flashDealRouter.post(
  '/',
  ...requirePermissions(Permission.adminPromotions),
  validate({ body: createFlashDealSchema }),
  flashDealController.create,
);

flashDealRouter.patch(
  '/:id',
  ...requirePermissions(Permission.adminPromotions),
  validate({ params: flashDealIdParamsSchema, body: updateFlashDealSchema }),
  flashDealController.update,
);

flashDealRouter.post(
  '/:id/end',
  ...requirePermissions(Permission.adminPromotions),
  validate({ params: flashDealIdParamsSchema }),
  flashDealController.endNow,
);
