import type { Request } from 'express';
import { AppError } from '../errors/AppError';

// Cloudinary returns absolute URLs; local uploads are root-relative and served by this API.
export const publicFileUrl = (req: Request, url: string) => {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const host = req.get('host');

  if (!host) {
    throw AppError.internal('Could not build the file URL');
  }

  return `${req.protocol}://${host}${url}`;
};
