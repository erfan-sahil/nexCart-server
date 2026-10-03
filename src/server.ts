import { createApp } from './app';
import { appState } from './config/appState';
import { connectDatabase, disconnectDatabase } from './config/database';
import { env } from './config/env';
import { ensureUploadDir } from './services/imageStorage';
import { logger } from './utils/logger';

const app = createApp();
const host = '0.0.0.0';

const start = async () => {
  await connectDatabase();
  await ensureUploadDir();
  appState.isReady = true;

  const server = app.listen(env.PORT, host, () => {
    logger.info(`NexCart API running on http://${host}:${env.PORT}`, {
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

      void disconnectDatabase()
        .then(() => {
          process.exit(0);
        })
        .catch((disconnectError: unknown) => {
          logger.error('Error disconnecting MongoDB', { err: disconnectError });
          process.exit(1);
        });
    });
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });

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
};

void start().catch((err: unknown) => {
  logger.error('Failed to start server', { err });
  process.exit(1);
});
