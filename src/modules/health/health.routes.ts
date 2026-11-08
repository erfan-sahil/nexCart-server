import { Router } from 'express';
import mongoose from 'mongoose';
import { appState } from '../../config/appState';
import { env } from '../../config/env';
import { redisHealth } from '../../config/redis';
import { AppError } from '../../common/errors/AppError';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendSuccess } from '../../common/http/sendResponse';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  sendSuccess(
    res,
    {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    { message: 'Service is healthy' },
  );
});

healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    if (
      appState.isShuttingDown ||
      !appState.isReady ||
      mongoose.connection.readyState !== mongoose.ConnectionStates.connected
    ) {
      throw AppError.serviceUnavailable('Server is not ready');
    }

    const redis = await redisHealth();

    // Redis only gates readiness when it is explicitly required; otherwise the API runs degraded.
    if (env.REDIS_REQUIRED && redis !== 'up') {
      throw AppError.serviceUnavailable('Server is not ready');
    }

    sendSuccess(
      res,
      {
        status: 'ready',
        redis,
        timestamp: new Date().toISOString(),
      },
      { message: 'Service is ready' },
    );
  }),
);
