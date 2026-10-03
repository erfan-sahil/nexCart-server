import { Router } from 'express';
import { Permission } from '../constants/permissions';
import { storeController } from '../controllers/store.controller';
import { requirePermissions } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  listStoresQuerySchema,
  storeIdParamsSchema,
  storeSlugParamsSchema,
  updateStoreSchema,
} from '../validators/store.validator';

export const storeRouter = Router();

storeRouter.get('/', validate({ query: listStoresQuerySchema }), storeController.listStores);

storeRouter.get(
  '/slug/:slug',
  validate({ params: storeSlugParamsSchema }),
  storeController.getStoreBySlug,
);

storeRouter.get('/me', ...requirePermissions(Permission.vendorStore), storeController.getMine);

storeRouter.patch(
  '/me',
  ...requirePermissions(Permission.vendorStore),
  validate({ body: updateStoreSchema }),
  storeController.updateMine,
);

storeRouter.get('/:id', validate({ params: storeIdParamsSchema }), storeController.getStore);
