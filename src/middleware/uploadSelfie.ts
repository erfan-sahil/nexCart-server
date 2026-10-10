import type { RequestHandler } from 'express';
import multer from 'multer';
import { isProductImageMimeType, MAX_PRODUCT_IMAGE_BYTES } from '../constants/product';
import { AppError } from '../utils/AppError';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PRODUCT_IMAGE_BYTES,
    files: 1,
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

export const uploadSelfie: RequestHandler = (req, res, next) => {
  upload.single('selfie')(req, res, (error: unknown) => {
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
        next(AppError.payloadTooLarge('The selfie must be 5 MB or smaller'));
        return;
      }

      next(AppError.badRequest('Could not read the selfie'));
      return;
    }

    next(error);
  });
};
