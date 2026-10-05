import type { Request, Response } from 'express';
import { variantService } from '../services/variant.service';
import type { ProductViewer } from '../types/product';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/sendResponse';
import type {
  CreateVariantInput,
  ListVariantsQuery,
  UpdateVariantInput,
} from '../validators/variant.validator';

const routeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const actorId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const viewerOf = (req: Request): ProductViewer | undefined => {
  if (!req.auth) {
    return undefined;
  }

  return {
    id: req.auth.user.id,
    role: req.auth.user.role,
  };
};

const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListVariantsQuery;
  const result = await variantService.list(routeParam(req.params.id), query, viewerOf(req));

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const getVariant = asyncHandler(async (req: Request, res: Response) => {
  const variant = await variantService.getById(
    routeParam(req.params.id),
    routeParam(req.params.variantId),
    viewerOf(req),
  );

  sendSuccess(res, variant, { message: 'Variant fetched' });
});

const createVariant = asyncHandler(async (req: Request, res: Response) => {
  const variant = await variantService.create(
    actorId(req),
    routeParam(req.params.id),
    req.body as CreateVariantInput,
  );

  sendCreated(res, variant, 'Variant created');
});

const updateVariant = asyncHandler(async (req: Request, res: Response) => {
  const variant = await variantService.update(
    actorId(req),
    routeParam(req.params.id),
    routeParam(req.params.variantId),
    req.body as UpdateVariantInput,
  );

  sendSuccess(res, variant, { message: 'Variant updated' });
});

const deleteVariant = asyncHandler(async (req: Request, res: Response) => {
  const result = await variantService.remove(
    actorId(req),
    routeParam(req.params.id),
    routeParam(req.params.variantId),
  );

  sendSuccess(res, result, { message: 'Variant deleted' });
});

export const variantController = {
  list,
  getVariant,
  createVariant,
  updateVariant,
  deleteVariant,
};
