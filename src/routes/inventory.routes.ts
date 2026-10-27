import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { Permission, roleHasPermission } from '../constants/permissions';
import { inventoryController } from '../controllers/inventory.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { AppError } from '../utils/AppError';
import {
  inventoryProductParamsSchema,
  inventoryProductVariantsQuerySchema,
  inventorySummaryQuerySchema,
  listInventoryProductsQuerySchema,
  listInventoryVariantsQuerySchema,
} from '../validators/inventory.validator';

export const inventoryRouter = Router();

function viewInventory(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.auth;

  if (!auth) {
    next(AppError.unauthorized());
    return;
  }

  const allowed =
    roleHasPermission(auth.user.role, Permission.vendorInventory) ||
    roleHasPermission(auth.user.role, Permission.adminCatalog);

  if (!allowed) {
    next(AppError.forbidden('You do not have permission to perform this action'));
    return;
  }

  next();
}

inventoryRouter.use(authenticate, viewInventory);

inventoryRouter.get(
  '/summary',
  validate({ query: inventorySummaryQuerySchema }),
  inventoryController.summary,
);

inventoryRouter.get(
  '/products',
  validate({ query: listInventoryProductsQuerySchema }),
  inventoryController.listProducts,
);

inventoryRouter.get(
  '/products/:productId',
  validate({ params: inventoryProductParamsSchema, query: inventoryProductVariantsQuerySchema }),
  inventoryController.getProduct,
);

inventoryRouter.get(
  '/variants',
  validate({ query: listInventoryVariantsQuerySchema }),
  inventoryController.listVariants,
);
