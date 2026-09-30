import type { ErrorCode } from '../constants/errorCodes';

export type FieldError = {
  path: string;
  message: string;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ApiMeta = {
  pagination?: PaginationMeta;
};

export type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
  meta?: ApiMeta;
  requestId: string;
};

export type ApiErrorResponse = {
  success: false;
  message: string;
  code: ErrorCode;
  requestId: string;
  errors?: FieldError[];
  stack?: string;
};
