import { Router } from 'express';
import { catalogController } from '../controllers/catalog.controller';
import { authenticateOptional } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import {
  catalogCollectionParamsSchema,
  listCatalogQuerySchema,
  relatedProductsParamsSchema,
  relatedProductsQuerySchema,
} from '../validators/catalog.validator';

export const catalogRouter = Router();

catalogRouter.get('/home', catalogController.home);

catalogRouter.get(
  '/recommendations',
  authenticateOptional,
  validate({ query: listCatalogQuerySchema }),
  catalogController.recommendations,
);

catalogRouter.get(
  '/collections/:collection',
  validate({ params: catalogCollectionParamsSchema, query: listCatalogQuerySchema }),
  catalogController.listCollection,
);

catalogRouter.get(
  '/products/:slug/related',
  validate({ params: relatedProductsParamsSchema, query: relatedProductsQuerySchema }),
  catalogController.related,
);
