export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiErrorResponse = {
  success: false;
  message: string;
  errors?: unknown;
};
