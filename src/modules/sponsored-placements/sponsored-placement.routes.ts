import { Router } from 'express';
import { Permission } from '../../common/constants/permissions';
import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { sponsoredPlacementController } from './sponsored-placement.controller';
import {
  sponsoredSlotParamsSchema,
  upsertSponsoredPlacementSchema,
} from './sponsored-placement.validator';

export const sponsoredPlacementRouter = Router();

sponsoredPlacementRouter.get('/', sponsoredPlacementController.listPublic);

sponsoredPlacementRouter.get(
  '/manage',
  ...requirePermissions(Permission.adminPromotions),
  sponsoredPlacementController.listManage,
);

sponsoredPlacementRouter.put(
  '/:slot',
  ...requirePermissions(Permission.adminPromotions),
  validate({ params: sponsoredSlotParamsSchema, body: upsertSponsoredPlacementSchema }),
  sponsoredPlacementController.upsert,
);
