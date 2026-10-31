import type { Request, Response } from 'express';
import { recommendedService } from '../recommended/recommended.service';
import { catalogService } from './catalog.service';
import type { CatalogCollectionParam } from './types';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendPaginated, sendSuccess } from '../../common/http/sendResponse';
import type { ListCatalogQuery, RelatedProductsQuery } from './catalog.validator';

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

const recommendations = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListCatalogQuery;
  const userId = req.auth?.user.id;
  const role = req.auth?.user.role;
  const result = await recommendedService.list(userId, role, query);
  const totalPages = query.limit > 0 ? Math.ceil(result.total / query.limit) : 0;

  sendSuccess(res, result.items, {
    message: 'Recommendations fetched',
    meta: {
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages,
      },
      personalized: result.personalized,
    },
  });
});

export const catalogController = {
  home,
  listCollection,
  related,
  recommendations,
};
