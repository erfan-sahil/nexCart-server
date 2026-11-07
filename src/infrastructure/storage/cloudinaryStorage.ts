import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { env } from '../../config/env';
import { AppError } from '../../common/errors/AppError';
import { logger } from '../../common/utils/logger';

export type CloudinaryAsset = {
  publicId: string;
  url: string;
  format: string;
  bytes: number;
};

const DELIVERY_HOST = 'res.cloudinary.com';

let configured = false;

const client = () => {
  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }

  return cloudinary;
};

const errorStatus = (error: unknown) => {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const nested = 'error' in error ? error.error : error;

  if (typeof nested === 'object' && nested !== null && 'http_code' in nested) {
    return Number(nested.http_code);
  }

  return undefined;
};

// Returns the public id and file extension for image URLs issued by this cloud, or null for any
// other URL. Transformations are rejected so a stored URL always points at the original asset.
export const parseCloudinaryUrl = (value: string) => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || url.hostname !== DELIVERY_HOST || url.search) {
    return null;
  }

  const prefix = `/${env.CLOUDINARY_CLOUD_NAME}/image/upload/`;

  if (!env.CLOUDINARY_CLOUD_NAME || !url.pathname.startsWith(prefix)) {
    return null;
  }

  const rest = url.pathname.slice(prefix.length).replace(/^v\d+\//, '');
  const match = /^(.+)\.([a-z0-9]+)$/.exec(rest);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  return { publicId: match[1], extension: match[2] };
};

export const uploadToCloudinary = (
  buffer: Buffer,
  options: { folder: string; id: string },
): Promise<CloudinaryAsset> =>
  new Promise((resolve, reject) => {
    const stream = client().uploader.upload_stream(
      {
        folder: `${env.CLOUDINARY_FOLDER}/${options.folder}`,
        public_id: options.id,
        resource_type: 'image',
        overwrite: false,
        unique_filename: false,
        use_filename: false,
      },
      (error, result?: UploadApiResponse) => {
        if (error || !result) {
          logger.error('Cloudinary upload failed', { err: error });
          reject(AppError.internal('Could not upload the image'));
          return;
        }

        resolve({
          publicId: result.public_id,
          url: result.secure_url,
          format: result.format ?? '',
          bytes: result.bytes,
        });
      },
    );

    stream.end(buffer);
  });

export const findCloudinaryAsset = async (publicId: string): Promise<CloudinaryAsset | null> => {
  try {
    const result = (await client().api.resource(publicId, { resource_type: 'image' })) as {
      public_id: string;
      secure_url: string;
      format?: string;
      bytes: number;
    };

    return {
      publicId: result.public_id,
      url: result.secure_url,
      format: result.format ?? '',
      bytes: result.bytes,
    };
  } catch (error) {
    if (errorStatus(error) === 404) {
      return null;
    }

    throw error;
  }
};

export const deleteFromCloudinary = async (publicId: string) => {
  await client().uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
};
