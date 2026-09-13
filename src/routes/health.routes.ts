import { Router } from 'express';
import { appState } from '../config/appState';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/sendResponse';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/ready', (_req, res) => {
  if (appState.isShuttingDown || !appState.isReady) {
    throw AppError.serviceUnavailable('Server is not ready');
  }

  sendSuccess(res, {
    status: 'ready',
    timestamp: new Date().toISOString(),
  });
});
