import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export const rejectMalformedUrl = (req: Request, _res: Response, next: NextFunction) => {
  try {
    decodeURIComponent(req.path);
    next();
  } catch {
    next(AppError.badRequest('Malformed URL'));
  }
};

export const stripTrailingSlash = (req: Request, _res: Response, next: NextFunction) => {
  const [pathname, search] = req.url.split('?');

  if (pathname && pathname.length > 1 && pathname.endsWith('/')) {
    req.url = pathname.slice(0, -1) + (search ? `?${search}` : '');
  }

  next();
};

export const rejectUnsupportedContentType = (req: Request, _res: Response, next: NextFunction) => {
  if (!WRITE_METHODS.has(req.method)) {
    next();
    return;
  }

  const contentLength = req.headers['content-length'];
  if (!contentLength || contentLength === '0') {
    next();
    return;
  }

  const contentType = req.headers['content-type'];
  if (!contentType) {
    next(AppError.unsupportedMedia('Content-Type header is required'));
    return;
  }

  const isSupported =
    contentType.includes('application/json') ||
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data');

  if (!isSupported) {
    next(AppError.unsupportedMedia());
    return;
  }

  next();
};
