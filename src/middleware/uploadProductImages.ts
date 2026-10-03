import type { RequestHandler } from 'express';
import multer from 'multer';
import {
  MAX_PRODUCT_IMAGE_BYTES,
  MAX_PRODUCT_IMAGES,
  isProductImageMimeType,
} from '../constants/product';
import { AppError } from '../utils/AppError';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PRODUCT_IMAGE_BYTES,
    files: MAX_PRODUCT_IMAGES,
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

export const uploadProductImages: RequestHandler = (req, res, next) => {
  upload.array('images', MAX_PRODUCT_IMAGES)(req, res, (error: unknown) => {
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

      if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
        next(AppError.validation(`Send up to ${MAX_PRODUCT_IMAGES} images in the images field`));
        return;
      }

      next(AppError.badRequest('Could not read the uploaded images'));
      return;
    }

    next(error);
  });
};
