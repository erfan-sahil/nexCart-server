import type { Request, Response } from 'express';
import { storeImageFiles } from '../middleware/uploadStoreImages';
import { imageStorage } from '../services/imageStorage';
import { storeService } from '../services/store.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendPaginated, sendSuccess } from '../utils/sendResponse';
import type { ListStoresQuery, UpdateStoreInput } from '../validators/store.validator';
import type { ImageOptimizeProfile } from '../services/imageOptimizer';

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

const absoluteUploadUrl = (req: Request, url: string) => {
  const host = req.get('host');

  if (!host) {
    throw AppError.internal('Could not build the file URL');
  }

  return `${req.protocol}://${host}${url}`;
};

const STORE_IMAGE_PROFILES = {
  logo: 'catalog',
  banner: 'hero',
} as const satisfies Record<'logo' | 'banner', ImageOptimizeProfile>;

const saveUploadedStoreImages = async (req: Request) => {
  const files = storeImageFiles(req);
  const saved: Array<{ field: 'logo' | 'banner'; url: string; storageKey: string }> = [];

  try {
    for (const field of ['logo', 'banner'] as const) {
      const file = files[field]?.[0];

      if (!file) {
        continue;
      }

      if (!Buffer.isBuffer(file.buffer) || file.buffer.length < 1) {
        throw AppError.validation('An image file is required', [
          { path: field, message: 'An image file is required' },
        ]);
      }

      const mimeType = file.mimetype.split(';')[0]?.trim().toLowerCase() ?? '';
      const stored = await imageStorage.saveStoreImage(
        { buffer: file.buffer, mimeType },
        STORE_IMAGE_PROFILES[field],
      );

      saved.push({
        field,
        storageKey: stored.storageKey,
        url: absoluteUploadUrl(req, stored.url),
      });
    }
  } catch (error) {
    await Promise.all(
      saved.map((image) => imageStorage.removeStore(image.storageKey).catch(() => undefined)),
    );
    throw error;
  }

  return saved;
};

const updateMine = asyncHandler(async (req: Request, res: Response) => {
  const input = { ...(req.body as UpdateStoreInput) };
  const uploaded = await saveUploadedStoreImages(req);

  for (const image of uploaded) {
    input[image.field] = image.url;
  }

  const store = await storeService.updateMine(
    actorId(req),
    input,
    uploaded.map((image) => image.storageKey),
  );

  sendSuccess(res, store, { message: 'Store updated' });
});

export const storeController = {
  listStores,
  getStoreBySlug,
  getStore,
  getMine,
  updateMine,
};
