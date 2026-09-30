import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const headerId = req.header('x-request-id')?.trim() ?? '';
  const id = REQUEST_ID_PATTERN.test(headerId) ? headerId : randomUUID();

  req.requestId = id;
  req.log = logger.child({ requestId: id });
  res.setHeader('X-Request-Id', id);
  next();
};
