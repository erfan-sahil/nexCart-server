import type { RequestHandler } from 'express';
import multer from 'multer';
import { MAX_PRODUCT_IMAGE_BYTES, isProductImageMimeType } from '../constants/product';
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

export const uploadHeroImage: RequestHandler = (req, res, next) => {
  upload.single('image')(req, res, (error: unknown) => {
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
          AppError.validation('Send one image in the image field', [
            { path: 'image', message: 'Send one image in the image field' },
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
