export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'INTERNAL_ERROR',
    public readonly isOperational = true,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new AppError(400, message, 'BAD_REQUEST', true, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(403, message, 'FORBIDDEN');
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, message, 'NOT_FOUND');
  }

  static requestTimeout(message = 'Request timeout') {
    return new AppError(408, message, 'REQUEST_TIMEOUT');
  }

  static conflict(message = 'Conflict') {
    return new AppError(409, message, 'CONFLICT');
  }

  static payloadTooLarge(message = 'Payload too large') {
    return new AppError(413, message, 'PAYLOAD_TOO_LARGE');
  }

  static unsupportedMedia(message = 'Unsupported media type') {
    return new AppError(415, message, 'UNSUPPORTED_MEDIA_TYPE');
  }

  static validation(message = 'Validation failed', details?: unknown) {
    return new AppError(422, message, 'VALIDATION_ERROR', true, details);
  }

  static tooManyRequests(message = 'Too many requests') {
    return new AppError(429, message, 'TOO_MANY_REQUESTS');
  }

  static internal(message = 'Internal server error') {
    return new AppError(500, message, 'INTERNAL_ERROR', false);
  }

  static serviceUnavailable(message = 'Service unavailable') {
    return new AppError(503, message, 'SERVICE_UNAVAILABLE');
  }
}
