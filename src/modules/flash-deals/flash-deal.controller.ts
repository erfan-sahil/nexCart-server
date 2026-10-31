import type { Request, Response } from 'express';
import { flashDealService } from './flash-deal.service';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendCreated, sendPaginated, sendSuccess } from '../../common/http/sendResponse';
import type {
  CreateFlashDealInput,
  ListFlashDealsQuery,
  UpdateFlashDealInput,
  UpdateFlashDealSettingsInput,
} from './flash-deal.validator';

const routeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await flashDealService.getSettings();
  sendSuccess(res, settings, { message: 'Flash deal settings fetched' });
});

const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await flashDealService.updateSettings(req.body as UpdateFlashDealSettingsInput);
  sendSuccess(res, settings, { message: 'Flash deal settings updated' });
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

const create = asyncHandler(async (req: Request, res: Response) => {
  const deal = await flashDealService.create(req.body as CreateFlashDealInput);
  sendCreated(res, deal, 'Flash deal created');
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const deal = await flashDealService.update(
    routeParam(req.params.id),
    req.body as UpdateFlashDealInput,
  );
  sendSuccess(res, deal, { message: 'Flash deal updated' });
});

const endNow = asyncHandler(async (req: Request, res: Response) => {
  const deal = await flashDealService.endNow(routeParam(req.params.id));
  sendSuccess(res, deal, { message: 'Flash deal ended' });
});

export const flashDealController = {
  getSettings,
  updateSettings,
  listManage,
  create,
  update,
  endNow,
};
