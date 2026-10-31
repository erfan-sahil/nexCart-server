import { Router } from 'express';
import { attributeRouter } from './modules/attributes';
import { authRouter } from './modules/auth';
import { catalogRouter } from './modules/catalog';
import { categoryRouter } from './modules/categories';
import {
  adminFulfillmentRouter,
  adminOrderFulfillmentRouter,
  vendorFulfillmentRouter,
} from './modules/fulfillment';
import { healthRouter } from './modules/health';
import { heroRouter } from './modules/hero';
import { inventoryRouter } from './modules/inventory';
import { orderRouter } from './modules/orders';
import { sslcommerzRouter } from './modules/payments';
import { productReportInboxRouter, productReportOnProductRouter } from './modules/product-reports';
import { productRouter } from './modules/products';
import { recentlyViewedRouter } from './modules/recently-viewed';
import { productReviewRouter } from './modules/reviews';
import { siteSettingsRouter } from './modules/site-settings';
import { storeRouter } from './modules/stores';
import { userRouter } from './modules/users';
import { vendorApplicationRouter } from './modules/vendor-applications';
import { wishlistRouter } from './modules/wishlist';

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
apiRouter.use('/site-settings', siteSettingsRouter);
apiRouter.use('/wishlist', wishlistRouter);
apiRouter.use('/recently-viewed', recentlyViewedRouter);
apiRouter.use('/payments/sslcommerz', sslcommerzRouter);
apiRouter.use('/vendor/fulfillments', vendorFulfillmentRouter);
apiRouter.use('/admin/fulfillments', adminFulfillmentRouter);
apiRouter.use('/admin/orders', adminOrderFulfillmentRouter);
