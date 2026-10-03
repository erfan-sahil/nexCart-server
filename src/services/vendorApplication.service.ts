import { Types, type FilterQuery, type HydratedDocument } from 'mongoose';
import {
  APPLICANT_EDITABLE_STATUSES,
  MIN_VENDOR_AGE_YEARS,
  VENDOR_APPLICATION_STATUSES,
} from '../constants/vendorApplication';
import { CategoryModel } from '../models/category.model';
import { UserModel } from '../models/user.model';
import { VendorApplicationModel, type VendorApplication } from '../models/vendorApplication.model';
import type { FieldError } from '../types';
import type {
  VendorAddressDto,
  VendorApplicationDto,
  VendorApplicationStatus,
  VendorApplicationStatusEventDto,
  VendorApplicationSummaryDto,
  VendorBusinessType,
  VendorDocumentType,
  VendorOptionalDocumentDto,
  VendorTaxDto,
} from '../types/vendorApplication';
import { AppError } from '../utils/AppError';
import { duplicateKeyFields, isDuplicateKeyError } from '../utils/mongoError';
import { escapeRegex } from '../utils/slugify';
import { storeService } from './store.service';
import type {
  ListVendorApplicationsQuery,
  ReviewVendorApplicationInput,
  SaveVendorApplicationInput,
  VendorApplicationNoteInput,
} from '../validators/vendorApplication.validator';

type VendorApplicationDocument = HydratedDocument<VendorApplication>;

type AddressSource = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

const SORTS: Record<ListVendorApplicationsQuery['sort'], Record<string, 1 | -1>> = {
  updatedAt: { updatedAt: 1 },
  '-updatedAt': { updatedAt: -1 },
  submittedAt: { submittedAt: 1 },
  '-submittedAt': { submittedAt: -1 },
  createdAt: { createdAt: 1 },
  '-createdAt': { createdAt: -1 },
};

const EDITABLE = new Set<string>(APPLICANT_EDITABLE_STATUSES);

const toStatus = (status: string): VendorApplicationStatus => {
  const match = VENDOR_APPLICATION_STATUSES.find((item) => item === status);

  if (!match) {
    throw AppError.internal('Stored vendor application status is invalid');
  }

  return match;
};

const toDocumentType = (value: string): VendorDocumentType | null => {
  if (value === 'nid' || value === 'passport') {
    return value;
  }

  if (value === '') {
    return null;
  }

  throw AppError.internal('Stored identity document type is invalid');
};

const toBusinessType = (value: string): VendorBusinessType | null => {
  if (value === 'individual' || value === 'company') {
    return value;
  }

  if (value === '') {
    return null;
  }

  throw AppError.internal('Stored business type is invalid');
};

const toDateOnly = (value: Date | null | undefined) => {
  if (!value) {
    return null;
  }

  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');

  return `${value.getUTCFullYear()}-${month}-${day}`;
};

const toIso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

const toAddressDto = (address: AddressSource | null | undefined): VendorAddressDto => ({
  line1: address?.line1 ?? '',
  line2: address?.line2 ?? '',
  city: address?.city ?? '',
  state: address?.state ?? '',
  postalCode: address?.postalCode ?? '',
  country: address?.country ?? '',
});

const toOptionalDocument = (
  number: string | undefined,
  documentUrl: string | undefined,
): VendorOptionalDocumentDto | null => {
  if (!number && !documentUrl) {
    return null;
  }

  return {
    number: number ?? '',
    documentUrl: documentUrl ?? '',
  };
};

const toTax = (taxId: string | undefined, documentUrl: string | undefined): VendorTaxDto | null => {
  if (!taxId && !documentUrl) {
    return null;
  }

  return {
    taxId: taxId ?? '',
    documentUrl: documentUrl ?? '',
  };
};

const toHistoryDto = (
  event: VendorApplication['statusHistory'][number],
): VendorApplicationStatusEventDto => ({
  status: toStatus(event.status),
  note: event.note,
  actorId: String(event.actorId),
  createdAt: event.createdAt.toISOString(),
});

const toDto = (
  application: VendorApplicationDocument | VendorApplication,
): VendorApplicationDto => ({
  id: String(application._id),
  userId: String(application.userId),
  status: toStatus(application.status),
  personal: {
    fullName: application.personal.fullName,
    email: application.personal.email,
    phone: application.personal.phone,
    dateOfBirth: toDateOnly(application.personal.dateOfBirth),
    address: toAddressDto(application.personal.address),
  },
  identity: {
    documentType: toDocumentType(application.identity.documentType),
    documentNumber: application.identity.documentNumber,
    documentImages: [...application.identity.documentImages],
    selfieUrl: application.identity.selfieUrl,
  },
  business: {
    storeName: application.business.storeName,
    businessType: toBusinessType(application.business.businessType),
    address: toAddressDto(application.business.address),
    tradeLicense: toOptionalDocument(
      application.business.tradeLicense?.number,
      application.business.tradeLicense?.documentUrl,
    ),
    tax: toTax(application.business.tax?.taxId, application.business.tax?.documentUrl),
  },
  selling: {
    categoryIds: application.selling.categoryIds.map((id) => String(id)),
    description: application.selling.description,
  },
  reviewNote: application.reviewNote,
  submittedAt: toIso(application.submittedAt),
  reviewedAt: toIso(application.reviewedAt),
  reviewedBy: application.reviewedBy ? String(application.reviewedBy) : null,
  statusHistory: application.statusHistory.map(toHistoryDto),
  createdAt: application.createdAt.toISOString(),
  updatedAt: application.updatedAt.toISOString(),
});

const toSummary = (application: VendorApplication): VendorApplicationSummaryDto => ({
  id: String(application._id),
  userId: String(application.userId),
  status: toStatus(application.status),
  fullName: application.personal.fullName,
  email: application.personal.email,
  phone: application.personal.phone,
  storeName: application.business.storeName,
  businessType: toBusinessType(application.business.businessType),
  submittedAt: toIso(application.submittedAt),
  updatedAt: application.updatedAt.toISOString(),
});

const mapDuplicate = (error: unknown) => {
  if (!isDuplicateKeyError(error)) {
    return error;
  }

  const fields = duplicateKeyFields(error);

  if (fields.some((field) => field.includes('documentNumber'))) {
    return AppError.conflict('An application with this identity document already exists');
  }

  return AppError.conflict('You already have a vendor application');
};

const parseDateOfBirth = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw AppError.validation('Use YYYY-MM-DD for date of birth');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    year < 1900
  ) {
    throw AppError.validation('Date of birth is not a real date');
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const adultOn = Date.UTC(year + MIN_VENDOR_AGE_YEARS, month - 1, day);

  if (adultOn > todayUtc) {
    throw AppError.validation(`You must be at least ${MIN_VENDOR_AGE_YEARS} years old`);
  }

  return date;
};

const loadApplicant = async (userId: string) => {
  const user = await UserModel.findById(userId).select(
    'email firstName lastName phone role status',
  );

  if (!user) {
    throw AppError.unauthorized();
  }

  if (user.status !== 'active') {
    throw AppError.forbidden('Your account is suspended');
  }

  if (user.role === 'admin') {
    throw AppError.forbidden('Admins cannot apply to sell');
  }

  if (user.role === 'vendor') {
    throw AppError.conflict('You already have vendor access');
  }

  return user;
};

const assertEditable = (status: string) => {
  if (status === 'approved') {
    throw AppError.conflict('This application is already approved');
  }

  if (!EDITABLE.has(status)) {
    throw AppError.conflict('This application cannot be edited while it is being reviewed');
  }
};

const assertCategories = async (categoryIds: string[]) => {
  if (categoryIds.length === 0) {
    return;
  }

  const categories = await CategoryModel.find({ _id: { $in: categoryIds } }).select('_id isActive');

  if (categories.length !== categoryIds.length) {
    throw AppError.badRequest('One or more categories were not found');
  }

  if (categories.some((category) => !category.isActive)) {
    throw AppError.validation('Inactive categories cannot be selected');
  }
};

const assignAddress = (
  current: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  },
  patch: AddressSource,
) => {
  if (patch.line1 !== undefined) {
    current.line1 = patch.line1;
  }

  if (patch.line2 !== undefined) {
    current.line2 = patch.line2;
  }

  if (patch.city !== undefined) {
    current.city = patch.city;
  }

  if (patch.state !== undefined) {
    current.state = patch.state;
  }

  if (patch.postalCode !== undefined) {
    current.postalCode = patch.postalCode;
  }

  if (patch.country !== undefined) {
    current.country = patch.country;
  }
};

const applyPatch = async (
  application: VendorApplicationDocument,
  input: SaveVendorApplicationInput,
) => {
  if (input.personal) {
    if (input.personal.fullName !== undefined) {
      application.personal.fullName = input.personal.fullName;
    }

    if (input.personal.email !== undefined) {
      application.personal.email = input.personal.email;
    }

    if (input.personal.phone !== undefined) {
      application.personal.phone = input.personal.phone;
    }

    if (input.personal.dateOfBirth !== undefined) {
      application.personal.dateOfBirth = parseDateOfBirth(input.personal.dateOfBirth);
    }

    if (input.personal.address) {
      assignAddress(application.personal.address, input.personal.address);
    }
  }

  if (input.identity) {
    if (input.identity.documentType !== undefined) {
      application.identity.documentType = input.identity.documentType;
    }

    if (input.identity.documentNumber !== undefined) {
      application.identity.documentNumber = input.identity.documentNumber;
    }

    if (input.identity.documentImages !== undefined) {
      application.identity.documentImages = input.identity.documentImages;
    }

    if (input.identity.selfieUrl !== undefined) {
      application.identity.selfieUrl = input.identity.selfieUrl;
    }
  }

  if (input.business) {
    if (input.business.storeName !== undefined) {
      application.business.storeName = input.business.storeName;
    }

    if (input.business.businessType !== undefined) {
      application.business.businessType = input.business.businessType;
    }

    if (input.business.address) {
      assignAddress(application.business.address, input.business.address);
    }

    if (input.business.tradeLicense === null) {
      application.business.tradeLicense.number = '';
      application.business.tradeLicense.documentUrl = '';
    } else if (input.business.tradeLicense) {
      if (input.business.tradeLicense.number !== undefined) {
        application.business.tradeLicense.number = input.business.tradeLicense.number;
      }

      if (input.business.tradeLicense.documentUrl !== undefined) {
        application.business.tradeLicense.documentUrl = input.business.tradeLicense.documentUrl;
      }
    }

    if (input.business.tax === null) {
      application.business.tax.taxId = '';
      application.business.tax.documentUrl = '';
    } else if (input.business.tax) {
      if (input.business.tax.taxId !== undefined) {
        application.business.tax.taxId = input.business.tax.taxId;
      }

      if (input.business.tax.documentUrl !== undefined) {
        application.business.tax.documentUrl = input.business.tax.documentUrl;
      }
    }
  }

  if (input.selling) {
    if (input.selling.categoryIds !== undefined) {
      await assertCategories(input.selling.categoryIds);
      application.selling.categoryIds = input.selling.categoryIds.map(
        (id) => new Types.ObjectId(id),
      );
    }

    if (input.selling.description !== undefined) {
      application.selling.description = input.selling.description;
    }
  }
};

const saveApplication = async (application: VendorApplicationDocument) => {
  try {
    await application.save();
  } catch (error) {
    throw mapDuplicate(error);
  }
};

const requireText = (
  errors: FieldError[],
  value: string,
  path: string,
  message: string,
  min = 1,
) => {
  if (value.trim().length < min) {
    errors.push({ path, message });
  }
};

const assertReadyToSubmit = async (application: VendorApplicationDocument) => {
  const errors: FieldError[] = [];
  const personal = application.personal;
  const identity = application.identity;
  const business = application.business;
  const selling = application.selling;

  requireText(errors, personal.fullName, 'personal.fullName', 'Full name is required', 2);
  requireText(errors, personal.email, 'personal.email', 'Email is required');
  requireText(errors, personal.phone, 'personal.phone', 'Phone is required');

  if (!personal.dateOfBirth) {
    errors.push({ path: 'personal.dateOfBirth', message: 'Date of birth is required' });
  }

  requireText(
    errors,
    personal.address.line1,
    'personal.address.line1',
    'Address line is required',
    2,
  );
  requireText(errors, personal.address.city, 'personal.address.city', 'City is required', 2);
  requireText(errors, personal.address.state, 'personal.address.state', 'State is required', 2);
  requireText(
    errors,
    personal.address.postalCode,
    'personal.address.postalCode',
    'Postal code is required',
    2,
  );
  requireText(
    errors,
    personal.address.country,
    'personal.address.country',
    'Country is required',
    2,
  );

  if (!toDocumentType(identity.documentType)) {
    errors.push({
      path: 'identity.documentType',
      message: 'Identity document type is required',
    });
  }

  requireText(
    errors,
    identity.documentNumber,
    'identity.documentNumber',
    'Identity document number is required',
    4,
  );

  if (identity.documentImages.length < 1) {
    errors.push({
      path: 'identity.documentImages',
      message: 'At least one identity document image is required',
    });
  }

  requireText(errors, business.storeName, 'business.storeName', 'Store name is required', 2);

  if (!toBusinessType(business.businessType)) {
    errors.push({ path: 'business.businessType', message: 'Business type is required' });
  }

  requireText(
    errors,
    business.address.line1,
    'business.address.line1',
    'Business address line is required',
    2,
  );
  requireText(
    errors,
    business.address.city,
    'business.address.city',
    'Business city is required',
    2,
  );
  requireText(
    errors,
    business.address.state,
    'business.address.state',
    'Business state is required',
    2,
  );
  requireText(
    errors,
    business.address.postalCode,
    'business.address.postalCode',
    'Business postal code is required',
    2,
  );
  requireText(
    errors,
    business.address.country,
    'business.address.country',
    'Business country is required',
    2,
  );

  if (selling.categoryIds.length < 1) {
    errors.push({
      path: 'selling.categoryIds',
      message: 'Select at least one category you want to sell',
    });
  }

  requireText(
    errors,
    selling.description,
    'selling.description',
    'Business description must be at least 20 characters',
    20,
  );

  if (errors.length > 0) {
    throw AppError.validation('Complete the application before submitting', errors);
  }

  await assertCategories(selling.categoryIds.map((id) => String(id)));
};

const recordStatus = (
  application: VendorApplicationDocument,
  status: VendorApplicationStatus,
  actorId: string,
  note: string,
) => {
  application.status = status;
  application.reviewNote = note;
  application.statusHistory.push({
    status,
    note,
    actorId: new Types.ObjectId(actorId),
    createdAt: new Date(),
  });
};

const findOwn = async (userId: string) => {
  const application = await VendorApplicationModel.findOne({ userId });

  if (!application) {
    throw AppError.notFound('Vendor application not found');
  }

  return application;
};

const findForReview = async (id: string, actorId: string) => {
  const application = await VendorApplicationModel.findById(id);

  if (!application) {
    throw AppError.notFound('Vendor application not found');
  }

  if (String(application.userId) === actorId) {
    throw AppError.forbidden('You cannot review your own application');
  }

  return application;
};

const requireStatus = (
  application: VendorApplicationDocument,
  expected: VendorApplicationStatus,
) => {
  if (application.status !== expected) {
    throw AppError.conflict(
      `This action is only available when the application is ${expected.replaceAll('_', ' ')}`,
    );
  }
};

const markReviewed = (application: VendorApplicationDocument, actorId: string) => {
  application.reviewedAt = new Date();
  application.reviewedBy = new Types.ObjectId(actorId);
};

export const vendorApplicationService = {
  async getMine(userId: string) {
    const application = await findOwn(userId);
    return toDto(application);
  },

  async updateMine(userId: string, input: SaveVendorApplicationInput) {
    const user = await loadApplicant(userId);
    let application = await VendorApplicationModel.findOne({ userId: user._id });
    let created = false;

    if (!application) {
      created = true;
      application = new VendorApplicationModel({
        userId: user._id,
        status: 'draft',
        personal: {
          fullName: `${user.firstName} ${user.lastName}`.trim(),
          email: user.email,
          phone: user.phone ?? '',
        },
        statusHistory: [
          {
            status: 'draft',
            note: '',
            actorId: user._id,
            createdAt: new Date(),
          },
        ],
      });
    } else {
      assertEditable(application.status);
    }

    await applyPatch(application, input);
    await saveApplication(application);

    return { application: toDto(application), created };
  },

  async submitMine(userId: string) {
    await loadApplicant(userId);
    const application = await findOwn(userId);

    assertEditable(application.status);
    await assertReadyToSubmit(application);

    recordStatus(application, 'submitted', userId, '');
    application.submittedAt = new Date();
    application.reviewedAt = null;
    application.reviewedBy = null;
    await saveApplication(application);

    return toDto(application);
  },

  async list(query: ListVendorApplicationsQuery) {
    const filter: FilterQuery<VendorApplication> = {};

    if (query.status) {
      filter.status = query.status;
    } else if (!query.includeDrafts) {
      filter.status = { $ne: 'draft' };
    }

    if (query.search) {
      const pattern = escapeRegex(query.search);
      filter.$or = [
        { 'personal.fullName': { $regex: pattern, $options: 'i' } },
        { 'personal.email': { $regex: pattern, $options: 'i' } },
        { 'personal.phone': { $regex: pattern, $options: 'i' } },
        { 'business.storeName': { $regex: pattern, $options: 'i' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      VendorApplicationModel.find(filter)
        .sort(SORTS[query.sort])
        .skip(skip)
        .limit(query.limit)
        .lean(),
      VendorApplicationModel.countDocuments(filter),
    ]);

    return {
      items: items.map((item) => toSummary(item)),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async getById(id: string) {
    const application = await VendorApplicationModel.findById(id);

    if (!application) {
      throw AppError.notFound('Vendor application not found');
    }

    return toDto(application);
  },

  async startReview(id: string, actorId: string, input: ReviewVendorApplicationInput) {
    const application = await findForReview(id, actorId);

    requireStatus(application, 'submitted');
    recordStatus(application, 'under_review', actorId, input.note ?? '');
    markReviewed(application, actorId);
    await saveApplication(application);

    return toDto(application);
  },

  async requestInfo(id: string, actorId: string, input: VendorApplicationNoteInput) {
    const application = await findForReview(id, actorId);

    requireStatus(application, 'under_review');
    recordStatus(application, 'more_info_required', actorId, input.note);
    markReviewed(application, actorId);
    await saveApplication(application);

    return toDto(application);
  },

  async approve(id: string, actorId: string, input: ReviewVendorApplicationInput) {
    const application = await findForReview(id, actorId);

    requireStatus(application, 'under_review');

    const user = await UserModel.findById(application.userId);

    if (!user) {
      throw AppError.notFound('Applicant account was not found');
    }

    if (user.role === 'admin') {
      throw AppError.conflict('An admin account cannot be approved as a vendor');
    }

    const previousRole = user.role;
    const store = await storeService.ensureForVendor({
      userId: String(application.userId),
      name: application.business.storeName,
      description: application.selling.description,
      email: application.personal.email,
      phone: application.personal.phone,
      address: {
        line1: application.business.address.line1,
        line2: application.business.address.line2,
        city: application.business.address.city,
        state: application.business.address.state,
        postalCode: application.business.address.postalCode,
        country: application.business.address.country,
      },
      categoryIds: application.selling.categoryIds.map((categoryId) => String(categoryId)),
    });

    try {
      if (previousRole !== 'vendor') {
        user.role = 'vendor';
        await user.save();
      }

      recordStatus(application, 'approved', actorId, input.note ?? '');
      markReviewed(application, actorId);
      await saveApplication(application);
    } catch (error) {
      if (previousRole !== 'vendor') {
        user.role = previousRole;
        await user.save();
      }

      if (store.created) {
        await storeService.removeForVendor(String(application.userId));
      }

      throw error;
    }

    return toDto(application);
  },

  async reject(id: string, actorId: string, input: VendorApplicationNoteInput) {
    const application = await findForReview(id, actorId);

    requireStatus(application, 'under_review');
    recordStatus(application, 'rejected', actorId, input.note);
    markReviewed(application, actorId);
    await saveApplication(application);

    return toDto(application);
  },
};
