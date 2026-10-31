export const PRODUCT_REPORT_TYPES = [
  'misleading_listing',
  'counterfeit',
  'prohibited',
  'inappropriate_content',
  'pricing',
  'safety',
  'spam',
  'other',
] as const;

export const PRODUCT_REPORT_STATUSES = ['open', 'reviewed', 'dismissed'] as const;

export const REPORT_MESSAGE_MIN = 10;
export const REPORT_MESSAGE_MAX = 600;

export const DEFAULT_REPORT_PAGE = 1;
export const DEFAULT_REPORT_LIMIT = 20;
export const MAX_REPORT_LIMIT = 50;
