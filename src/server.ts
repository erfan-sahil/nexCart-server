import { createApp } from './app';
import { appState } from './config/appState';
import { env } from './config/env';
import { logger } from './utils/logger';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`NexCart API running on http://localhost:${env.PORT}`, {
    env: env.NODE_ENV,
  });
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.requestTimeout = env.REQUEST_TIMEOUT_MS + 1_000;

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${env.PORT} is already in use`);
    process.exit(1);
  }

  logger.error('Server failed to start', { err });
  process.exit(1);
});

let isShuttingDown = false;

const shutdown = (signal: string) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  appState.isShuttingDown = true;
  appState.isReady = false;

  logger.info(`${signal} received. Closing server...`);

  const forceExit = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, env.SHUTDOWN_TIMEOUT_MS);

  forceExit.unref();

  server.close((closeError) => {
    if (closeError) {
      logger.error('Error during shutdown', { err: closeError });
      process.exit(1);
    }

    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { err });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { err: reason });

  if (env.NODE_ENV === 'production') {
    shutdown('unhandledRejection');
  }
});
