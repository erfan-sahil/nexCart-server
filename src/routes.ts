import { Router } from 'express';
import { attributeRouter } from './modules/attributes';
import { authRouter } from './modules/auth';
import { catalogRouter } from './modules/catalog';
import { categoryRouter } from './modules/categories';
import { couponRouter } from './modules/coupons';
import { flashDealRouter } from './modules/flash-deals';
import {
  adminFulfillmentRouter,
  adminOrderFulfillmentRouter,
  vendorFulfillmentRouter,
} from './modules/fulfillment';
import { healthRouter } from './modules/health';
import { heroRouter } from './modules/hero';
import { inventoryRouter } from './modules/inventory';
import { orderRouter } from './modules/orders';
import {
  adminOrderManagementRouter,
  vendorOrderRouter,
} from './modules/orders/vendor-order.routes';
import { adminVendorOrderRouter } from './modules/orders/admin-vendor-order.routes';
import { adminCommissionRouter, vendorWalletRouter } from './modules/wallet/wallet.routes';
import {
  adminWithdrawalRouter,
  vendorWithdrawalRouter,
} from './modules/withdrawals/withdrawal.routes';
import { adminReturnRouter, vendorReturnRouter } from './modules/returns/return.routes';
import {
  adminVendorReturnShipmentRouter,
  vendorVendorReturnShipmentRouter,
} from './modules/returns/vendor-return-shipment.routes';
import { adminFinanceReportRouter } from './modules/reports/finance-report.routes';
import { adminDashboardRouter } from './modules/dashboard';
import { vendorAnalyticsRouter, vendorDashboardRouter } from './modules/vendor-dashboard';
import { sslcommerzRouter } from './modules/payments';
import { productReportInboxRouter, productReportOnProductRouter } from './modules/product-reports';
import { productRouter } from './modules/products';
import { recentlyViewedRouter } from './modules/recently-viewed';
import { adminReviewRouter, productReviewRouter, vendorReviewRouter } from './modules/reviews';
import { sponsoredPlacementRouter } from './modules/sponsored-placements';
import { siteSettingsRouter } from './modules/site-settings';
import { adminStoreRouter, storeRouter } from './modules/stores';
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
apiRouter.use('/admin/stores', adminStoreRouter);
apiRouter.use('/attributes', attributeRouter);
apiRouter.use('/categories', categoryRouter);
apiRouter.use('/coupons', couponRouter);
apiRouter.use('/flash-deals', flashDealRouter);
apiRouter.use('/sponsored-placements', sponsoredPlacementRouter);
apiRouter.use('/catalog', catalogRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/products', productReviewRouter);
apiRouter.use('/products', productReportOnProductRouter);
apiRouter.use('/product-reports', productReportInboxRouter);
apiRouter.use('/admin/reviews', adminReviewRouter);
apiRouter.use('/vendor/reviews', vendorReviewRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/vendor/orders', vendorOrderRouter);
apiRouter.use('/admin/vendor-orders', adminVendorOrderRouter);
apiRouter.use('/site-settings', siteSettingsRouter);
apiRouter.use('/wishlist', wishlistRouter);
apiRouter.use('/recently-viewed', recentlyViewedRouter);
apiRouter.use('/payments/sslcommerz', sslcommerzRouter);
apiRouter.use('/vendor/fulfillments', vendorFulfillmentRouter);
apiRouter.use('/admin/fulfillments', adminFulfillmentRouter);
apiRouter.use('/admin/orders', adminOrderManagementRouter);
apiRouter.use('/admin/orders', adminOrderFulfillmentRouter);
apiRouter.use('/vendor/wallet', vendorWalletRouter);
apiRouter.use('/admin/commission', adminCommissionRouter);
apiRouter.use('/vendor/withdrawals', vendorWithdrawalRouter);
apiRouter.use('/admin/withdrawals', adminWithdrawalRouter);
apiRouter.use('/vendor/returns', vendorReturnRouter);
apiRouter.use('/admin/returns', adminReturnRouter);
apiRouter.use('/vendor/vendor-return-shipments', vendorVendorReturnShipmentRouter);
apiRouter.use('/admin/vendor-return-shipments', adminVendorReturnShipmentRouter);
apiRouter.use('/admin/finance/reports', adminFinanceReportRouter);
apiRouter.use('/admin/dashboard', adminDashboardRouter);
apiRouter.use('/vendor/dashboard', vendorDashboardRouter);
apiRouter.use('/vendor/analytics', vendorAnalyticsRouter);
