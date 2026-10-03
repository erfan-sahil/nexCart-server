import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { uploadRoot } from '../config/uploads';
import {
  PRODUCT_IMAGE_EXTENSIONS,
  isProductImageMimeType,
  MAX_PRODUCT_IMAGE_BYTES,
  type ProductImageMimeType,
} from '../constants/product';
import type { ImageProvider } from '../types/product';
import { AppError } from '../utils/AppError';

export type StoredImage = {
  id: string;
  provider: ImageProvider;
  storageKey: string;
  url: string;
  mimeType: ProductImageMimeType;
  size: number;
};

const LOCAL_KEY = /^products\/img_[a-f0-9]{24}\.(jpg|png|webp|gif)$/;

const createImageId = () => `img_${randomBytes(12).toString('hex')}`;

const hasSignature = (mimeType: ProductImageMimeType, buffer: Buffer) => {
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimeType === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }

  if (mimeType === 'image/gif') {
    const header = buffer.toString('ascii', 0, 6);
    return header === 'GIF87a' || header === 'GIF89a';
  }

  return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
};

const localPath = (storageKey: string) => {
  if (!LOCAL_KEY.test(storageKey)) {
    throw AppError.internal('Stored image path is invalid');
  }

  const root = path.resolve(uploadRoot);
  const target = path.resolve(root, storageKey);

  if (!target.startsWith(`${root}${path.sep}`)) {
    throw AppError.internal('Stored image path is invalid');
  }

  return target;
};

export const ensureUploadDir = async () => {
  await mkdir(path.join(uploadRoot, 'products'), { recursive: true });
};

// Local disk for now. The image id stays on the product if storage later moves
// to a platform that issues its own id; that platform id belongs in storageKey.
export const imageStorage = {
  async save(file: { buffer: Buffer; mimeType: string }): Promise<StoredImage> {
    const mimeType = file.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';

    if (!isProductImageMimeType(mimeType)) {
      throw AppError.unsupportedMedia('Only JPEG, PNG, WebP, and GIF images are allowed');
    }

    if (file.buffer.length < 1 || file.buffer.length > MAX_PRODUCT_IMAGE_BYTES) {
      throw AppError.payloadTooLarge('Each image must be 5 MB or smaller');
    }

    if (!hasSignature(mimeType, file.buffer)) {
      throw AppError.validation('File content does not match its image type');
    }

    const id = createImageId();
    const extension = PRODUCT_IMAGE_EXTENSIONS[mimeType];
    const storageKey = `products/${id}${extension}`;
    const target = localPath(storageKey);

    await ensureUploadDir();

    try {
      await writeFile(target, file.buffer);
    } catch (error) {
      await unlink(target).catch(() => undefined);
      throw error;
    }

    return {
      id,
      provider: 'local',
      storageKey,
      url: `/uploads/${storageKey}`,
      mimeType,
      size: file.buffer.length,
    };
  },

  async remove(storageKey: string) {
    try {
      await unlink(localPath(storageKey));
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return;
      }

      throw error;
    }
  },
};
