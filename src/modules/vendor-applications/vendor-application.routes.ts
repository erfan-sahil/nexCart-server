import { Router } from 'express';
import { Permission } from '../../common/constants/permissions';
import { vendorApplicationController } from './vendor-application.controller';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermissions } from '../../common/middleware/authorize';
import { uploadApplicationFile } from './upload-application-file';
import { uploadSelfie } from './upload-selfie';
import { validate } from '../../common/middleware/validate';
import {
  listVendorApplicationsQuerySchema,
  reviewVendorApplicationSchema,
  updateVendorApplicationSchema,
  vendorApplicationIdParamsSchema,
  vendorApplicationNoteSchema,
} from './vendor-application.validator';

export const vendorApplicationRouter = Router();

vendorApplicationRouter.get('/me', authenticate, vendorApplicationController.getMine);

vendorApplicationRouter.patch(
  '/me',
  authenticate,
  validate({ body: updateVendorApplicationSchema }),
  vendorApplicationController.updateMine,
);

vendorApplicationRouter.post(
  '/me/selfie',
  authenticate,
  uploadSelfie,
  vendorApplicationController.uploadMineSelfie,
);

vendorApplicationRouter.post(
  '/me/files',
  authenticate,
  uploadApplicationFile,
  vendorApplicationController.uploadMineFile,
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
