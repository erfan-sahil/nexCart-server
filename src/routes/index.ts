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
import { recentlyViewedRouter } from '../modules/recently-viewed/recently-viewed.routes';
import { wishlistRouter } from '../modules/wishlist/wishlist.routes';
import {
  adminFulfillmentRouter,
  adminOrderFulfillmentRouter,
  vendorFulfillmentRouter,
} from '../modules/fulfillment/fulfillment.routes';
import { productReviewRouter } from '../modules/reviews/review.routes';
import {
  productReportInboxRouter,
  productReportOnProductRouter,
} from '../modules/product-reports/product-report.routes';
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
apiRouter.use('/products', productReviewRouter);
apiRouter.use('/products', productReportOnProductRouter);
apiRouter.use('/product-reports', productReportInboxRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/wishlist', wishlistRouter);
apiRouter.use('/recently-viewed', recentlyViewedRouter);
apiRouter.use('/payments/sslcommerz', sslcommerzRouter);
apiRouter.use('/vendor/fulfillments', vendorFulfillmentRouter);
apiRouter.use('/admin/fulfillments', adminFulfillmentRouter);
apiRouter.use('/admin/orders', adminOrderFulfillmentRouter);
