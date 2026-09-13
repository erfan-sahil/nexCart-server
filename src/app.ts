import compression from 'compression';
import cors from 'cors';
import express, { type Request } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsOptions } from './config/cors';
import { env, isProduction } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import {
  rejectMalformedUrl,
  rejectUnsupportedContentType,
  stripTrailingSlash,
} from './middleware/normalizeRequest';
import { notFound } from './middleware/notFound';
import { apiLimiter } from './middleware/rateLimiter';
import { requestId } from './middleware/requestId';
import { requestTimeout } from './middleware/requestTimeout';
import { apiRouter } from './routes';
import { sendSuccess } from './utils/sendResponse';

morgan.token('request-id', (req) => (req as Request).requestId);

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
    }),
  );
  app.use(cors(corsOptions));
  app.use(compression());
  app.use(rejectUnsupportedContentType);
  app.use(express.json({ limit: env.BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.BODY_LIMIT }));
  app.use(requestTimeout);
  app.use(apiLimiter);
  app.use(
    morgan(isProduction ? ':method :url :status :response-time ms :request-id' : 'dev', {
      skip: (req) => isProduction && req.path.startsWith('/api/health'),
    }),
  );

  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
  });

  app.get('/', (_req, res) => {
    sendSuccess(res, {
      name: 'NexCart API',
      status: 'ok',
      health: '/api/health',
      ready: '/api/health/ready',
    });
  });

  app.use('/api', apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
};
