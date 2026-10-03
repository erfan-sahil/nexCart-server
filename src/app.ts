import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { corsOptions } from './config/cors';
import { env, isProduction } from './config/env';
import { uploadRoot } from './config/uploads';
import { errorHandler } from './middleware/errorHandler';
import {
  rejectMalformedUrl,
  rejectUnsupportedContentType,
  stripTrailingSlash,
} from './middleware/normalizeRequest';
import { notFound } from './middleware/notFound';
import { apiLimiter } from './middleware/rateLimiter';
import { requestId } from './middleware/requestId';
import { requestLogger } from './middleware/requestLogger';
import { requestTimeout } from './middleware/requestTimeout';
import { apiRouter } from './routes';
import { sendSuccess } from './utils/sendResponse';

export const createApp = () => {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(rejectMalformedUrl);
  app.use(stripTrailingSlash);
  app.use(
    helmet({
      contentSecurityPolicy: isProduction,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors(corsOptions));
  app.use(compression());
  app.use(rejectUnsupportedContentType);
  app.use(express.json({ limit: env.BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.BODY_LIMIT }));
  app.use(requestTimeout);
  app.use(apiLimiter);
  app.use(requestLogger);
  app.use(
    '/uploads',
    express.static(uploadRoot, {
      index: false,
      dotfiles: 'deny',
      maxAge: isProduction ? '7d' : 0,
    }),
  );

  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
  });

  app.get('/', (_req, res) => {
    sendSuccess(
      res,
      {
        name: 'NexCart API',
        status: 'ok',
        health: '/api/health',
        ready: '/api/health/ready',
      },
      { message: 'NexCart API' },
    );
  });

  app.use('/api', apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
};
