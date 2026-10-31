export const VENDOR_APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'more_info_required',
  'approved',
  'rejected',
] as const;

export const VENDOR_DOCUMENT_TYPES = ['nid', 'passport'] as const;

export const VENDOR_BUSINESS_TYPES = ['individual', 'company'] as const;

export const APPLICANT_EDITABLE_STATUSES = ['draft', 'more_info_required', 'rejected'] as const;

export const MIN_VENDOR_AGE_YEARS = 18;
