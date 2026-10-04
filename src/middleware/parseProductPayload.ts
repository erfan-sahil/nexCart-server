import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError';

export const parseProductPayload: RequestHandler = (req, _res, next) => {
  const body: unknown = req.body;
  const payload =
    body && typeof body === 'object' && 'payload' in body && typeof body.payload === 'string'
      ? body.payload
      : undefined;

  if (!payload) {
    next();
    return;
  }

  try {
    const parsed = JSON.parse(payload) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      next(AppError.badRequest('Invalid JSON payload'));
      return;
    }

    req.body = parsed;
    next();
  } catch {
    next(AppError.badRequest('Invalid JSON payload'));
  }
};
