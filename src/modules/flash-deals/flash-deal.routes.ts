import { Router } from 'express';
import { Permission } from '../../common/constants/permissions';
import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { flashDealController } from './flash-deal.controller';
import {
  createFlashDealCampaignSchema,
  createFlashDealItemSchema,
  flashDealIdParamsSchema,
  flashDealItemParamsSchema,
  listFlashDealsQuerySchema,
  setFlashDealEnabledSchema,
  updateFlashDealCampaignSchema,
  updateFlashDealItemSchema,
} from './flash-deal.validator';

export const flashDealRouter = Router();

flashDealRouter.get('/settings', flashDealController.getSettings);
flashDealRouter.get('/meta', flashDealController.getPublicMeta);

flashDealRouter.get(
  '/manage',
  ...requirePermissions(Permission.adminPromotions),
  validate({ query: listFlashDealsQuerySchema }),
  flashDealController.listManage,
);

flashDealRouter.post(
  '/',
  ...requirePermissions(Permission.adminPromotions),
  validate({ body: createFlashDealCampaignSchema }),
  flashDealController.create,
);

flashDealRouter.get(
  '/:id',
  ...requirePermissions(Permission.adminPromotions),
  validate({ params: flashDealIdParamsSchema }),
  flashDealController.getById,
);

flashDealRouter.patch(
  '/:id',
  ...requirePermissions(Permission.adminPromotions),
  validate({ params: flashDealIdParamsSchema, body: updateFlashDealCampaignSchema }),
  flashDealController.update,
);

flashDealRouter.post(
  '/:id/end',
  ...requirePermissions(Permission.adminPromotions),
  validate({ params: flashDealIdParamsSchema }),
  flashDealController.endNow,
);

flashDealRouter.patch(
  '/:id/enabled',
  ...requirePermissions(Permission.adminPromotions),
  validate({ params: flashDealIdParamsSchema, body: setFlashDealEnabledSchema }),
  flashDealController.setEnabled,
);

flashDealRouter.post(
  '/:id/items',
  ...requirePermissions(Permission.adminPromotions),
  validate({ params: flashDealIdParamsSchema, body: createFlashDealItemSchema }),
  flashDealController.addItem,
);

flashDealRouter.patch(
  '/:id/items/:itemId',
  ...requirePermissions(Permission.adminPromotions),
  validate({ params: flashDealItemParamsSchema, body: updateFlashDealItemSchema }),
  flashDealController.updateItem,
);

flashDealRouter.delete(
  '/:id/items/:itemId',
  ...requirePermissions(Permission.adminPromotions),
  validate({ params: flashDealItemParamsSchema }),
  flashDealController.removeItem,
);
