import { Router } from 'express';
import { requirePermissions } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { recentlyViewedController, recentlyViewedPermissions } from './recently-viewed.controller';
import {
  recentlyViewedProductParamsSchema,
  recordRecentlyViewedSchema,
} from './recently-viewed.validator';

export const recentlyViewedRouter = Router();

recentlyViewedRouter.get(
  '/',
  ...requirePermissions(recentlyViewedPermissions.list),
  recentlyViewedController.list,
);

recentlyViewedRouter.post(
  '/',
  ...requirePermissions(recentlyViewedPermissions.record),
  validate({ body: recordRecentlyViewedSchema }),
  recentlyViewedController.record,
);

recentlyViewedRouter.delete(
  '/',
  ...requirePermissions(recentlyViewedPermissions.clear),
  recentlyViewedController.clear,
);

recentlyViewedRouter.delete(
  '/:productId',
  ...requirePermissions(recentlyViewedPermissions.remove),
  validate({ params: recentlyViewedProductParamsSchema }),
  recentlyViewedController.remove,
);
