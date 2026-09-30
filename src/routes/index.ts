import { Router } from 'express';
import { attributeRouter } from './attribute.routes';
import { categoryRouter } from './category.routes';
import { healthRouter } from './health.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/attributes', attributeRouter);
apiRouter.use('/categories', categoryRouter);
