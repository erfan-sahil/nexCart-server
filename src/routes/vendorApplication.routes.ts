import { Router } from 'express';
import { Permission } from '../constants/permissions';
import { vendorApplicationController } from '../controllers/vendorApplication.controller';
import { authenticate } from '../middleware/authenticate';
import { requirePermissions } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  listVendorApplicationsQuerySchema,
  reviewVendorApplicationSchema,
  updateVendorApplicationSchema,
  vendorApplicationIdParamsSchema,
  vendorApplicationNoteSchema,
} from '../validators/vendorApplication.validator';

export const vendorApplicationRouter = Router();

vendorApplicationRouter.get('/me', authenticate, vendorApplicationController.getMine);

vendorApplicationRouter.patch(
  '/me',
  authenticate,
  validate({ body: updateVendorApplicationSchema }),
  vendorApplicationController.updateMine,
);

vendorApplicationRouter.post('/me/submit', authenticate, vendorApplicationController.submitMine);

vendorApplicationRouter.get(
  '/',
  ...requirePermissions(Permission.adminVendorApprovals),
  validate({ query: listVendorApplicationsQuerySchema }),
  vendorApplicationController.listApplications,
);

vendorApplicationRouter.get(
  '/:id',
  ...requirePermissions(Permission.adminVendorApprovals),
  validate({ params: vendorApplicationIdParamsSchema }),
  vendorApplicationController.getApplication,
);

vendorApplicationRouter.post(
  '/:id/review',
  ...requirePermissions(Permission.adminVendorApprovals),
  validate({ params: vendorApplicationIdParamsSchema, body: reviewVendorApplicationSchema }),
  vendorApplicationController.startReview,
);

vendorApplicationRouter.post(
  '/:id/request-info',
  ...requirePermissions(Permission.adminVendorApprovals),
  validate({ params: vendorApplicationIdParamsSchema, body: vendorApplicationNoteSchema }),
  vendorApplicationController.requestInfo,
);

vendorApplicationRouter.post(
  '/:id/approve',
  ...requirePermissions(Permission.adminVendorApprovals),
  validate({ params: vendorApplicationIdParamsSchema, body: reviewVendorApplicationSchema }),
  vendorApplicationController.approveApplication,
);

vendorApplicationRouter.post(
  '/:id/reject',
  ...requirePermissions(Permission.adminVendorApprovals),
  validate({ params: vendorApplicationIdParamsSchema, body: vendorApplicationNoteSchema }),
  vendorApplicationController.rejectApplication,
);
