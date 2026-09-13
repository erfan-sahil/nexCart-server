export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiErrorResponse = {
  success: false;
  message: string;
  code: string;
  requestId: string;
  errors?: unknown;
  stack?: string;
};
