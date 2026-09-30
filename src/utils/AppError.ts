import { ErrorCode } from '../constants/errorCodes';
import type { FieldError } from '../types';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    public readonly isOperational = true,
    public readonly details?: FieldError[],
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details?: FieldError[]) {
    return new AppError(400, message, ErrorCode.BAD_REQUEST, true, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(401, message, ErrorCode.UNAUTHORIZED);
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(403, message, ErrorCode.FORBIDDEN);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, message, ErrorCode.NOT_FOUND);
  }

  static requestTimeout(message = 'Request timeout') {
    return new AppError(408, message, ErrorCode.REQUEST_TIMEOUT);
  }

  static conflict(message = 'Conflict') {
    return new AppError(409, message, ErrorCode.CONFLICT);
  }

  static payloadTooLarge(message = 'Payload too large') {
    return new AppError(413, message, ErrorCode.PAYLOAD_TOO_LARGE);
  }

  static unsupportedMedia(message = 'Unsupported media type') {
    return new AppError(415, message, ErrorCode.UNSUPPORTED_MEDIA_TYPE);
  }

  static validation(message = 'Validation failed', details?: FieldError[]) {
    return new AppError(422, message, ErrorCode.VALIDATION_ERROR, true, details);
  }

  static tooManyRequests(message = 'Too many requests') {
    return new AppError(429, message, ErrorCode.TOO_MANY_REQUESTS);
  }

  static internal(message = 'Internal server error') {
    return new AppError(500, message, ErrorCode.INTERNAL_ERROR, false);
  }

  static serviceUnavailable(message = 'Service unavailable') {
    return new AppError(503, message, ErrorCode.SERVICE_UNAVAILABLE);
  }
}
