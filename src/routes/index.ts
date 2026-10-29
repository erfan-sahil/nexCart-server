import { Router } from 'express';
import { attributeRouter } from './attribute.routes';
import { authRouter } from './auth.routes';
import { catalogRouter } from './catalog.routes';
import { categoryRouter } from './category.routes';
import { healthRouter } from './health.routes';
import { heroRouter } from './hero.routes';
import { inventoryRouter } from './inventory.routes';
import { orderRouter } from '../modules/orders/order.routes';
import { sslcommerzRouter } from '../modules/payments/payment.routes';
import {
  adminFulfillmentRouter,
  adminOrderFulfillmentRouter,
  vendorFulfillmentRouter,
} from '../modules/fulfillment/fulfillment.routes';
import { userRouter } from './user.routes';
import { productRouter } from './product.routes';
import { storeRouter } from './store.routes';
import { vendorApplicationRouter } from './vendorApplication.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/hero', heroRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/vendor-applications', vendorApplicationRouter);
apiRouter.use('/stores', storeRouter);
apiRouter.use('/attributes', attributeRouter);
apiRouter.use('/categories', categoryRouter);
apiRouter.use('/catalog', catalogRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/payments/sslcommerz', sslcommerzRouter);
apiRouter.use('/vendor/fulfillments', vendorFulfillmentRouter);
apiRouter.use('/admin/fulfillments', adminFulfillmentRouter);
apiRouter.use('/admin/orders', adminOrderFulfillmentRouter);
