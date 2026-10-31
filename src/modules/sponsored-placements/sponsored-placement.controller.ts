import type { Request, Response } from 'express';
import { sponsoredPlacementService } from './sponsored-placement.service';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendSuccess } from '../../common/http/sendResponse';
import type { UpsertSponsoredPlacementInput } from './sponsored-placement.validator';
import type { SponsoredSlot } from './types';

const routeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const listPublic = asyncHandler(async (_req: Request, res: Response) => {
  const promos = await sponsoredPlacementService.listPublic();
  sendSuccess(res, promos, { message: 'Sponsored placements fetched' });
});

const listManage = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await sponsoredPlacementService.listManage();
  sendSuccess(res, rows, { message: 'Sponsored placements fetched' });
});

const upsert = asyncHandler(async (req: Request, res: Response) => {
  const slot = routeParam(req.params.slot) as SponsoredSlot;
  const row = await sponsoredPlacementService.upsert(
    slot,
    req.body as UpsertSponsoredPlacementInput,
  );
  sendSuccess(res, row, { message: 'Sponsored placement saved' });
});

export const sponsoredPlacementController = {
  listPublic,
  listManage,
  upsert,
};
