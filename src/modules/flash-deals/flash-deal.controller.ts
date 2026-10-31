import type { Request, Response } from 'express';
import { flashDealService } from './flash-deal.service';
import { asyncHandler } from '../../common/http/asyncHandler';
import {
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../common/http/sendResponse';
import type {
  CreateFlashDealCampaignInput,
  CreateFlashDealItemInput,
  ListFlashDealsQuery,
  SetFlashDealEnabledInput,
  UpdateFlashDealCampaignInput,
  UpdateFlashDealItemInput,
} from './flash-deal.validator';

const routeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await flashDealService.getSettings();
  sendSuccess(res, settings, { message: 'Flash deal settings fetched' });
});

const getPublicMeta = asyncHandler(async (_req: Request, res: Response) => {
  const meta = await flashDealService.getPublicMeta();
  sendSuccess(res, meta, { message: 'Flash deal meta fetched' });
});

const listManage = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListFlashDealsQuery;
  const result = await flashDealService.listManage(query);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const getById = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await flashDealService.getById(routeParam(req.params.id));
  sendSuccess(res, campaign, { message: 'Flash deal fetched' });
});

const create = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await flashDealService.create(req.body as CreateFlashDealCampaignInput);
  sendCreated(res, campaign, 'Flash deal created');
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await flashDealService.update(
    routeParam(req.params.id),
    req.body as UpdateFlashDealCampaignInput,
  );
  sendSuccess(res, campaign, { message: 'Flash deal updated' });
});

const endNow = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await flashDealService.endNow(routeParam(req.params.id));
  sendSuccess(res, campaign, { message: 'Flash deal ended' });
});

const setEnabled = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await flashDealService.setEnabled(
    routeParam(req.params.id),
    req.body as SetFlashDealEnabledInput,
  );
  sendSuccess(res, campaign, {
    message: campaign.isEnabled ? 'Flash deal activated' : 'Flash deal deactivated',
  });
});

const addItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await flashDealService.addItem(
    routeParam(req.params.id),
    req.body as CreateFlashDealItemInput,
  );
  sendCreated(res, item, 'Flash deal product added');
});

const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await flashDealService.updateItem(
    routeParam(req.params.id),
    routeParam(req.params.itemId),
    req.body as UpdateFlashDealItemInput,
  );
  sendSuccess(res, item, { message: 'Flash deal product updated' });
});

const removeItem = asyncHandler(async (req: Request, res: Response) => {
  await flashDealService.removeItem(routeParam(req.params.id), routeParam(req.params.itemId));
  sendNoContent(res);
});

export const flashDealController = {
  getSettings,
  getPublicMeta,
  listManage,
  getById,
  create,
  update,
  endNow,
  setEnabled,
  addItem,
  updateItem,
  removeItem,
};
