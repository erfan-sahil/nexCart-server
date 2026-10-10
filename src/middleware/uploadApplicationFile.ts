import type { RequestHandler } from 'express';
import multer from 'multer';
import { MAX_PRODUCT_IMAGE_BYTES } from '../constants/product';
import { AppError } from '../utils/AppError';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PRODUCT_IMAGE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const mimeType = file.mimetype.split(';')[0]?.trim().toLowerCase() ?? '';

    if (!ALLOWED.has(mimeType)) {
      callback(AppError.unsupportedMedia('Only JPEG, PNG, WebP, GIF, and PDF files are allowed'));
      return;
    }

    callback(null, true);
  },
});

export const uploadApplicationFile: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (error: unknown) => {
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
        next(AppError.payloadTooLarge('Each file must be 5 MB or smaller'));
        return;
      }

      next(AppError.badRequest('Could not read the file'));
      return;
    }

    next(error);
  });
};
