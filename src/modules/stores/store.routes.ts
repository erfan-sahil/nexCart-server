import type { RequestHandler } from 'express';
import { Router } from 'express';
import { Permission } from '../../common/constants/permissions';
import { validate } from '../../common/middleware/validate';
import { requirePermissions } from '../../common/middleware/authorize';
import {
  adminStoreSuspensionBodySchema,
  listAdminStoresQuerySchema,
  listStoresQuerySchema,
  storeIdParamsSchema,
  storeSlugParamsSchema,
  updateStoreFieldsSchema,
  updateStoreSchema,
} from './store.validator';
import { storeController, storePermissions } from './store.controller';
import { parseProductPayload } from '../products/parse-product-payload';
import { preferStoreImageFiles, storeImageFiles, uploadStoreImages } from './upload-store-images';

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

export const adminStoreRouter = Router();

adminStoreRouter.get(
  '/',
  ...requirePermissions(storePermissions.admin),
  validate({ query: listAdminStoresQuerySchema }),
  storeController.listAdmin,
);

adminStoreRouter.get(
  '/:id',
  ...requirePermissions(storePermissions.admin),
  validate({ params: storeIdParamsSchema }),
  storeController.getAdmin,
);

adminStoreRouter.patch(
  '/:id/suspension',
  ...requirePermissions(storePermissions.admin),
  validate({ params: storeIdParamsSchema, body: adminStoreSuspensionBodySchema }),
  storeController.setAdminSuspension,
);

adminStoreRouter.delete(
  '/:id',
  ...requirePermissions(storePermissions.admin),
  validate({ params: storeIdParamsSchema }),
  storeController.removeAdmin,
);
