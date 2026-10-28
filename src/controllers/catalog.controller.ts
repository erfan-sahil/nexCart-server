import type { Request, Response } from 'express';
import { catalogService } from '../services/catalog.service';
import type { CatalogCollectionParam } from '../types/catalog';
import { asyncHandler } from '../utils/asyncHandler';
import { sendPaginated, sendSuccess } from '../utils/sendResponse';
import type { ListCatalogQuery, RelatedProductsQuery } from '../validators/catalog.validator';

const routeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const home = asyncHandler(async (_req: Request, res: Response) => {
  const catalog = await catalogService.home();

  sendSuccess(res, catalog, { message: 'Homepage catalog fetched' });
});

const listCollection = asyncHandler(async (req: Request, res: Response) => {
  const collection = routeParam(req.params.collection) as CatalogCollectionParam;
  const query = req.query as unknown as ListCatalogQuery;
  const result = await catalogService.list(collection, query);

  sendPaginated(
    res,
    result.items,
    {
      page: result.page,
      limit: result.limit,
      total: result.total,
    },
    'Collection fetched',
  );
});

const related = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as RelatedProductsQuery;
  const items = await catalogService.related(routeParam(req.params.slug), query.limit);

  sendSuccess(res, items, { message: 'Related products fetched' });
});

export const catalogController = {
  home,
  listCollection,
  related,
};
