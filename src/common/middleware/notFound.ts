import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';

export const notFound = (req: Request, _res: Response, next: NextFunction) => {
  next(AppError.notFound(`Cannot ${req.method} ${req.path}`));
};
