import { Router } from 'express';
import mongoose from 'mongoose';
import { appState } from '../config/appState';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/sendResponse';

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

healthRouter.get('/ready', (_req, res) => {
  if (
    appState.isShuttingDown ||
    !appState.isReady ||
    mongoose.connection.readyState !== mongoose.ConnectionStates.connected
  ) {
    throw AppError.serviceUnavailable('Server is not ready');
  }

  sendSuccess(
    res,
    {
      status: 'ready',
      timestamp: new Date().toISOString(),
    },
    { message: 'Service is ready' },
  );
});
