import type { Request, Response } from 'express';
import { inventoryService } from '../services/inventory.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendPaginated, sendSuccess } from '../utils/sendResponse';
import type {
  InventoryProductVariantsQuery,
  InventorySummaryQuery,
  ListInventoryProductsQuery,
  ListInventoryVariantsQuery,
} from '../validators/inventory.validator';

const routeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const actorOf = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return {
    id: req.auth.user.id,
    role: req.auth.user.role,
  };
};

const summary = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as InventorySummaryQuery;
  const inventory = await inventoryService.summary(actorOf(req), query);

  sendSuccess(res, inventory, { message: 'Inventory summary fetched' });
});

const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListInventoryProductsQuery;
  const result = await inventoryService.listProducts(actorOf(req), query);

  sendPaginated(
    res,
    result.items,
    { page: result.page, limit: result.limit, total: result.total },
    'Product inventory fetched',
  );
});

const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as InventoryProductVariantsQuery;
  const result = await inventoryService.getProduct(
    actorOf(req),
    routeParam(req.params.productId),
    query,
  );

  sendSuccess(res, result.detail, {
    message: 'Product inventory fetched',
    meta: {
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 0,
      },
    },
  });
});

const listVariants = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListInventoryVariantsQuery;
  const result = await inventoryService.listVariants(actorOf(req), query);

  sendPaginated(
    res,
    result.items,
    { page: result.page, limit: result.limit, total: result.total },
    'Variant inventory fetched',
  );
});

export const inventoryController = {
  summary,
  listProducts,
  getProduct,
  listVariants,
};
