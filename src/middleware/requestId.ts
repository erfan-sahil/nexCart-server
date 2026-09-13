import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const headerId = req.header('x-request-id');
  req.requestId = headerId && headerId.trim().length > 0 ? headerId.trim() : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
