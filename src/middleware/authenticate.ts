import type { NextFunction, Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { AppError } from '../utils/AppError';

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw AppError.unauthorized('Access token is required');
    }

    const token = header.slice('Bearer '.length).trim();

    if (!token) {
      throw AppError.unauthorized('Access token is required');
    }

    req.auth = await authService.resolveAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
};

export const authenticateOptional = (req: Request, res: Response, next: NextFunction) => {
  if (!req.headers.authorization) {
    next();
    return;
  }

  void authenticate(req, res, next);
};
