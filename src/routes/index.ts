import { Router } from 'express';
import { categoryRouter } from './category.routes';
import { healthRouter } from './health.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/categories', categoryRouter);
