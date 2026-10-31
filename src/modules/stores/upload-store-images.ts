import type { Request, RequestHandler } from 'express';
import multer from 'multer';
import { MAX_PRODUCT_IMAGE_BYTES, isProductImageMimeType } from '../products/constants';
import { AppError } from '../../common/errors/AppError';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PRODUCT_IMAGE_BYTES,
    files: 2,
  },
  fileFilter: (_req, file, callback) => {
    const mimeType = file.mimetype.split(';')[0]?.trim().toLowerCase() ?? '';

    if (!isProductImageMimeType(mimeType)) {
      callback(AppError.unsupportedMedia('Only JPEG, PNG, WebP, and GIF images are allowed'));
      return;
    }

    callback(null, true);
  },
});

export type StoreImageFiles = {
  logo?: Express.Multer.File[];
  banner?: Express.Multer.File[];
};

export const storeImageFiles = (req: Request): StoreImageFiles => {
  const files = req.files;

  if (!files || Array.isArray(files)) {
    return {};
  }

  return files;
};

const hasStoreImageFile = (req: Request) => {
  const files = storeImageFiles(req);

  return Boolean(files.logo?.length || files.banner?.length);
};

export const uploadStoreImages: RequestHandler = (req, res, next) => {
  const contentType = req.headers['content-type'] ?? '';

  if (!contentType.includes('multipart/form-data')) {
    next();
    return;
  }

  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
  ])(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof AppError) {
      next(error);
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(AppError.payloadTooLarge('Each image must be 5 MB or smaller'));
        return;
      }

      if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') {
        next(
          AppError.validation('Send at most one logo and one banner image', [
            { path: 'logo', message: 'Send at most one logo and one banner image' },
          ]),
        );
        return;
      }

      next(AppError.badRequest('Could not read the image'));
      return;
    }

    next(error);
  });
};

export const preferStoreImageFiles: RequestHandler = (req, _res, next) => {
  if (
    !hasStoreImageFile(req) ||
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body)
  ) {
    next();
    return;
  }

  const files = storeImageFiles(req);
  const body = req.body as { logo?: unknown; banner?: unknown };

  if (files.logo?.length) {
    delete body.logo;
  }

  if (files.banner?.length) {
    delete body.banner;
  }

  next();
};
