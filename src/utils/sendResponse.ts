import type { Response } from 'express';
import type { ApiMeta, ApiSuccess, PaginationMeta } from '../types';

type SendSuccessOptions = {
  statusCode?: number;
  message?: string;
  meta?: ApiMeta;
};

type PaginationInput = Omit<PaginationMeta, 'totalPages'> & {
  totalPages?: number;
};

const isOptions = (value: number | SendSuccessOptions): value is SendSuccessOptions =>
  typeof value === 'object';

export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusOrOptions: number | SendSuccessOptions = 200,
) => {
  const options = isOptions(statusOrOptions) ? statusOrOptions : { statusCode: statusOrOptions };

  const payload: ApiSuccess<T> = {
    success: true,
    message: options.message ?? 'Success',
    data,
    requestId: res.req.requestId,
  };

  if (options.meta) {
    payload.meta = options.meta;
  }

  res.status(options.statusCode ?? 200).json(payload);
};

export const sendCreated = <T>(res: Response, data: T, message = 'Created') => {
  sendSuccess(res, data, { statusCode: 201, message });
};

export const sendNoContent = (res: Response) => {
  res.status(204).end();
};

export const sendPaginated = <T>(
  res: Response,
  data: T[],
  pagination: PaginationInput,
  message = 'Success',
) => {
  const totalPages =
    pagination.totalPages ??
    (pagination.limit > 0 ? Math.ceil(pagination.total / pagination.limit) : 0);

  sendSuccess(res, data, {
    message,
    meta: {
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages,
      },
    },
  });
};
