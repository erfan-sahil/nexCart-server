import type { Response } from 'express';
import type { ApiSuccess } from '../types';

export const sendSuccess = <T>(res: Response, data: T, statusCode = 200) => {
  const payload: ApiSuccess<T> = {
    success: true,
    data,
  };

  res.status(statusCode).json(payload);
};
