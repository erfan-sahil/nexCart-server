import type { RequestHandler } from 'express';
import { Router } from 'express';
import { Permission } from '../constants/permissions';
import { storeController } from '../controllers/store.controller';
import { requirePermissions } from '../middleware/authorize';
import { parseProductPayload } from '../middleware/parseProductPayload';
import {
  preferStoreImageFiles,
  storeImageFiles,
  uploadStoreImages,
} from '../middleware/uploadStoreImages';
import { validate } from '../middleware/validate';
import {
  listStoresQuerySchema,
  storeIdParamsSchema,
  storeSlugParamsSchema,
  updateStoreFieldsSchema,
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

const validateStoreUpdate: RequestHandler = (req, res, next) => {
  const files = storeImageFiles(req);
  const hasImage = Boolean(files.logo?.length || files.banner?.length);

  return validate({ body: hasImage ? updateStoreFieldsSchema : updateStoreSchema })(req, res, next);
};

storeRouter.patch(
  '/me',
  ...requirePermissions(Permission.vendorStore),
  uploadStoreImages,
  parseProductPayload,
  preferStoreImageFiles,
  validateStoreUpdate,
  storeController.updateMine,
);

storeRouter.get('/:id', validate({ params: storeIdParamsSchema }), storeController.getStore);
