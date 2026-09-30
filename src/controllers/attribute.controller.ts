import type { Request, Response } from 'express';
import { attributeService } from '../services/attribute.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/sendResponse';
import type {
  CreateAttributeInput,
  ListAttributesQuery,
  ReplaceCategoryAttributesInput,
  UpdateAttributeInput,
} from '../validators/attribute.validator';

const routeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const listAttributes = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListAttributesQuery;
  const result = await attributeService.list(query);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const getAttribute = asyncHandler(async (req: Request, res: Response) => {
  const attribute = await attributeService.getById(routeParam(req.params.id));

  sendSuccess(res, attribute, { message: 'Attribute fetched' });
});

const createAttribute = asyncHandler(async (req: Request, res: Response) => {
  const attribute = await attributeService.create(req.body as CreateAttributeInput);

  sendCreated(res, attribute, 'Attribute created');
});

const updateAttribute = asyncHandler(async (req: Request, res: Response) => {
  const attribute = await attributeService.update(
    routeParam(req.params.id),
    req.body as UpdateAttributeInput,
  );

  sendSuccess(res, attribute, { message: 'Attribute updated' });
});

const deleteAttribute = asyncHandler(async (req: Request, res: Response) => {
  const result = await attributeService.remove(routeParam(req.params.id));

  sendSuccess(res, result, { message: 'Attribute deleted' });
});

const listCategoryAttributes = asyncHandler(async (req: Request, res: Response) => {
  const attributes = await attributeService.listForCategory(routeParam(req.params.id));

  sendSuccess(res, attributes, { message: 'Category attributes fetched' });
});

const replaceCategoryAttributes = asyncHandler(async (req: Request, res: Response) => {
  const attributes = await attributeService.replaceForCategory(
    routeParam(req.params.id),
    req.body as ReplaceCategoryAttributesInput,
  );

  sendSuccess(res, attributes, { message: 'Category attributes updated' });
});

export const attributeController = {
  listAttributes,
  getAttribute,
  createAttribute,
  updateAttribute,
  deleteAttribute,
  listCategoryAttributes,
  replaceCategoryAttributes,
};
