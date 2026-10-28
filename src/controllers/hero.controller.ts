import type { Request, Response } from 'express';
import { heroService } from '../services/hero.service';
import { imageStorage } from '../services/imageStorage';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/sendResponse';
import type { UpsertHeroInput } from '../validators/hero.validator';

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
  uploadHeroImage,
};
