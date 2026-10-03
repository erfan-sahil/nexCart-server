import type {
  VENDOR_APPLICATION_STATUSES,
  VENDOR_BUSINESS_TYPES,
  VENDOR_DOCUMENT_TYPES,
} from '../constants/vendorApplication';

export type VendorApplicationStatus = (typeof VENDOR_APPLICATION_STATUSES)[number];

export type VendorDocumentType = (typeof VENDOR_DOCUMENT_TYPES)[number];

export type VendorBusinessType = (typeof VENDOR_BUSINESS_TYPES)[number];

export type VendorAddressDto = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type VendorOptionalDocumentDto = {
  number: string;
  documentUrl: string;
};

export type VendorTaxDto = {
  taxId: string;
  documentUrl: string;
};

export type VendorApplicationStatusEventDto = {
  status: VendorApplicationStatus;
  note: string;
  actorId: string;
  createdAt: string;
};

export type VendorApplicationDto = {
  id: string;
  userId: string;
  status: VendorApplicationStatus;
  personal: {
    fullName: string;
    email: string;
    phone: string;
    dateOfBirth: string | null;
    address: VendorAddressDto;
  };
  identity: {
    documentType: VendorDocumentType | null;
    documentNumber: string;
    documentImages: string[];
    selfieUrl: string;
  };
  business: {
    storeName: string;
    businessType: VendorBusinessType | null;
    address: VendorAddressDto;
    tradeLicense: VendorOptionalDocumentDto | null;
    tax: VendorTaxDto | null;
  };
  selling: {
    categoryIds: string[];
    description: string;
  };
  reviewNote: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  statusHistory: VendorApplicationStatusEventDto[];
  createdAt: string;
  updatedAt: string;
};

export type VendorApplicationSummaryDto = {
  id: string;
  userId: string;
  status: VendorApplicationStatus;
  fullName: string;
  email: string;
  phone: string;
  storeName: string;
  businessType: VendorBusinessType | null;
  submittedAt: string | null;
  updatedAt: string;
};
