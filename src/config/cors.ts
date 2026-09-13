import type { CorsOptions } from 'cors';
import { env } from './env';
import { AppError } from '../utils/AppError';

export const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || env.CORS_ORIGIN.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(AppError.forbidden('Origin not allowed by CORS'));
  },
};
