import type { Request, Response } from 'express';
import { vendorApplicationService } from '../services/vendorApplication.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendPaginated, sendSuccess } from '../utils/sendResponse';
import type {
  ListVendorApplicationsQuery,
  ReviewVendorApplicationInput,
  SaveVendorApplicationInput,
  VendorApplicationNoteInput,
} from '../validators/vendorApplication.validator';

const routeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const actorId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const getMine = asyncHandler(async (req: Request, res: Response) => {
  const application = await vendorApplicationService.getMine(actorId(req));

  sendSuccess(res, application, { message: 'Vendor application fetched' });
});

const updateMine = asyncHandler(async (req: Request, res: Response) => {
  const result = await vendorApplicationService.updateMine(
    actorId(req),
    req.body as SaveVendorApplicationInput,
  );

  sendSuccess(res, result.application, {
    statusCode: result.created ? 201 : 200,
    message: result.created ? 'Vendor application saved' : 'Vendor application updated',
  });
});

const submitMine = asyncHandler(async (req: Request, res: Response) => {
  const application = await vendorApplicationService.submitMine(actorId(req));

  sendSuccess(res, application, { message: 'Vendor application submitted' });
});

const listApplications = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListVendorApplicationsQuery;
  const result = await vendorApplicationService.list(query);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const getApplication = asyncHandler(async (req: Request, res: Response) => {
  const application = await vendorApplicationService.getById(routeParam(req.params.id));

  sendSuccess(res, application, { message: 'Vendor application fetched' });
});

const startReview = asyncHandler(async (req: Request, res: Response) => {
  const application = await vendorApplicationService.startReview(
    routeParam(req.params.id),
    actorId(req),
    req.body as ReviewVendorApplicationInput,
  );

  sendSuccess(res, application, { message: 'Vendor application is under review' });
});

const requestInfo = asyncHandler(async (req: Request, res: Response) => {
  const application = await vendorApplicationService.requestInfo(
    routeParam(req.params.id),
    actorId(req),
    req.body as VendorApplicationNoteInput,
  );

  sendSuccess(res, application, { message: 'More information requested' });
});

const approveApplication = asyncHandler(async (req: Request, res: Response) => {
  const application = await vendorApplicationService.approve(
    routeParam(req.params.id),
    actorId(req),
    req.body as ReviewVendorApplicationInput,
  );

  sendSuccess(res, application, { message: 'Vendor application approved' });
});

const rejectApplication = asyncHandler(async (req: Request, res: Response) => {
  const application = await vendorApplicationService.reject(
    routeParam(req.params.id),
    actorId(req),
    req.body as VendorApplicationNoteInput,
  );

  sendSuccess(res, application, { message: 'Vendor application rejected' });
});

export const vendorApplicationController = {
  getMine,
  updateMine,
  submitMine,
  listApplications,
  getApplication,
  startReview,
  requestInfo,
  approveApplication,
  rejectApplication,
};
