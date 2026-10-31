import { createHash } from 'node:crypto';
import { IdempotencyRecordModel } from '../../modules/orders/idempotency-record.model';
import { IDEMPOTENCY_TTL_HOURS } from '../../modules/orders/constants';
import type { IdempotencyScope } from '../../modules/orders/constants';
import { AppError } from '../errors/AppError';
import { isDuplicateKeyError } from '../errors/mongoError';

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);

export const hashRequestBody = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const readIdempotencyKey = (header: string | string[] | undefined) => {
  const raw = Array.isArray(header) ? header[0] : header;
  const key = raw?.trim();

  if (!key) {
    throw AppError.validation('Idempotency-Key header is required');
  }

  if (key.length > 255) {
    throw AppError.validation('Idempotency-Key is too long');
  }

  return key;
};

type IdempotentHandlerResult<T> = {
  statusCode: number;
  body: T;
};

type RunIdempotentOptions<T> = {
  customerId: string;
  scope: (typeof IdempotencyScope)[keyof typeof IdempotencyScope];
  key: string;
  requestBody: unknown;
  handler: () => Promise<IdempotentHandlerResult<T>>;
};

export async function runIdempotent<T>(options: RunIdempotentOptions<T>): Promise<T> {
  const requestHash = hashRequestBody(options.requestBody);
  const expiresAt = hoursFromNow(IDEMPOTENCY_TTL_HOURS);

  try {
    await IdempotencyRecordModel.create({
      customerId: options.customerId,
      scope: options.scope,
      key: options.key,
      requestHash,
      status: 'processing',
      expiresAt,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const existing = await IdempotencyRecordModel.findOne({
      customerId: options.customerId,
      scope: options.scope,
      key: options.key,
    });

    if (!existing) {
      throw AppError.conflict('This request is already being processed');
    }

    if (existing.requestHash !== requestHash) {
      throw AppError.conflict('Idempotency-Key was reused with a different request body');
    }

    if (existing.status === 'completed' && existing.responseBody !== null) {
      return existing.responseBody as T;
    }

    throw AppError.conflict('This request is already being processed');
  }

  try {
    const result = await options.handler();

    await IdempotencyRecordModel.updateOne(
      { customerId: options.customerId, scope: options.scope, key: options.key },
      {
        $set: {
          status: 'completed',
          responseStatusCode: result.statusCode,
          responseBody: result.body,
        },
      },
    );

    return result.body;
  } catch (error) {
    await IdempotencyRecordModel.deleteOne({
      customerId: options.customerId,
      scope: options.scope,
      key: options.key,
    });

    throw error;
  }
}
