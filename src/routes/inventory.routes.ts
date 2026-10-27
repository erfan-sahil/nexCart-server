import { Router } from 'express';
import { Permission } from '../constants/permissions';
import { inventoryController } from '../controllers/inventory.controller';
import { requireAnyPermissions } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  inventoryProductParamsSchema,
  inventoryProductVariantsQuerySchema,
  inventorySummaryQuerySchema,
  listInventoryProductsQuerySchema,
  listInventoryVariantsQuerySchema,
} from '../validators/inventory.validator';

export const inventoryRouter = Router();

const viewInventory = requireAnyPermissions(Permission.vendorInventory, Permission.adminCatalog);

inventoryRouter.get(
  '/summary',
  ...viewInventory,
  validate({ query: inventorySummaryQuerySchema }),
  inventoryController.summary,
);

inventoryRouter.get(
  '/products',
  ...viewInventory,
  validate({ query: listInventoryProductsQuerySchema }),
  inventoryController.listProducts,
);

inventoryRouter.get(
  '/products/:productId',
  ...viewInventory,
  validate({ params: inventoryProductParamsSchema, query: inventoryProductVariantsQuerySchema }),
  inventoryController.getProduct,
);

inventoryRouter.get(
  '/variants',
  ...viewInventory,
  validate({ query: listInventoryVariantsQuerySchema }),
  inventoryController.listVariants,
);
