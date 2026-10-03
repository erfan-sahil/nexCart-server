import type { Request, Response } from 'express';
import { storeService } from '../services/store.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendPaginated, sendSuccess } from '../utils/sendResponse';
import type { ListStoresQuery, UpdateStoreInput } from '../validators/store.validator';

const routeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const actorId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const listStores = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListStoresQuery;
  const result = await storeService.listPublic(query);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const getStoreBySlug = asyncHandler(async (req: Request, res: Response) => {
  const store = await storeService.getPublicBySlug(routeParam(req.params.slug));

  sendSuccess(res, store, { message: 'Store fetched' });
});

const getStore = asyncHandler(async (req: Request, res: Response) => {
  const store = await storeService.getPublicById(routeParam(req.params.id));

  sendSuccess(res, store, { message: 'Store fetched' });
});

const getMine = asyncHandler(async (req: Request, res: Response) => {
  const store = await storeService.getMine(actorId(req));

  sendSuccess(res, store, { message: 'Store fetched' });
});

const updateMine = asyncHandler(async (req: Request, res: Response) => {
  const store = await storeService.updateMine(actorId(req), req.body as UpdateStoreInput);

  sendSuccess(res, store, { message: 'Store updated' });
});

export const storeController = {
  listStores,
  getStoreBySlug,
  getStore,
  getMine,
  updateMine,
};
