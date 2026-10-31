import type { Request, Response } from 'express';
import { heroService } from './hero.service';
import { imageStorage } from '../../infrastructure/storage/imageStorage';
import { AppError } from '../../common/errors/AppError';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendSuccess } from '../../common/http/sendResponse';
import type { HeroIndexParams, SetHeroActiveInput, UpsertHeroInput } from './hero.validator';

const absoluteUploadUrl = (req: Request, url: string) => {
  const host = req.get('host');

  if (!host) {
    throw AppError.internal('Could not build the file URL');
  }

  return `${req.protocol}://${host}${url}`;
};

const getHero = asyncHandler(async (_req: Request, res: Response) => {
  const hero = await heroService.get();

  sendSuccess(res, hero, { message: 'Hero section fetched' });
});

const upsertHero = asyncHandler(async (req: Request, res: Response) => {
  const hero = await heroService.upsert(req.body as UpsertHeroInput);

  sendSuccess(res, hero, { message: 'Hero section saved' });
});

const setHeroActive = asyncHandler(async (req: Request, res: Response) => {
  const { index } = req.params as unknown as HeroIndexParams;
  const { isActive } = req.body as SetHeroActiveInput;
  const hero = await heroService.setActive(index, isActive);

  sendSuccess(res, hero, {
    message: isActive ? 'Hero activated' : 'Hero deactivated',
  });
});

const uploadHeroImage = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;

  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length < 1) {
    throw AppError.validation('An image file is required', [
      { path: 'image', message: 'An image file is required' },
    ]);
  }

  const mimeType = file.mimetype.split(';')[0]?.trim().toLowerCase() ?? '';
  const stored = await imageStorage.saveHeroImage({
    buffer: file.buffer,
    mimeType,
  });

  sendSuccess(
    res,
    { url: absoluteUploadUrl(req, stored.url) },
    { statusCode: 201, message: 'Hero image uploaded' },
  );
});

export const heroController = {
  getHero,
  upsertHero,
  setHeroActive,
  uploadHeroImage,
};
