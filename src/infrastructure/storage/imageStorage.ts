import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { uploadRoot } from '../../config/uploads';
import {
  PRODUCT_IMAGE_EXTENSIONS,
  isProductImageMimeType,
  MAX_PRODUCT_IMAGE_BYTES,
  type ProductImageMimeType,
} from '../../modules/products/constants';
import type { ImageProvider } from '../../modules/products/types';
import { AppError } from '../../common/errors/AppError';
import { optimizeImage, type ImageOptimizeProfile } from './imageOptimizer';

export type StoredImage = {
  id: string;
  provider: ImageProvider;
  storageKey: string;
  url: string;
  mimeType: ProductImageMimeType;
  size: number;
};

const LOCAL_KEY = /^products\/img_[a-f0-9]{24}\.(jpg|png|webp|gif)$/;
const CATEGORY_KEY = /^categories\/img_[a-f0-9]{24}\.(jpg|png|webp|gif)$/;
const CATEGORY_UPLOAD_PATH = /^\/uploads\/(categories\/img_[a-f0-9]{24}\.(?:jpg|png|webp|gif))$/;
const HERO_KEY = /^hero\/img_[a-f0-9]{24}\.(jpg|png|webp|gif)$/;
const HERO_UPLOAD_PATH = /^\/uploads\/(hero\/img_[a-f0-9]{24}\.(?:jpg|png|webp|gif))$/;
const STORE_KEY = /^stores\/img_[a-f0-9]{24}\.(jpg|png|webp|gif)$/;
const STORE_UPLOAD_PATH = /^\/uploads\/(stores\/img_[a-f0-9]{24}\.(?:jpg|png|webp|gif))$/;
const PRODUCT_UPLOAD_PATH = /^\/uploads\/(products\/img_[a-f0-9]{24}\.(?:jpg|png|webp|gif))$/;
const MIME_BY_EXTENSION: Record<string, ProductImageMimeType> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};
const APPLICATION_KEY = /^applications\/file_[a-f0-9]{24}\.(jpg|png|webp|gif|pdf)$/;

const APPLICATION_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
} as const;

type ApplicationMimeType = keyof typeof APPLICATION_EXTENSIONS;

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

const isApplicationMimeType = (value: string): value is ApplicationMimeType =>
  value in APPLICATION_EXTENSIONS;

const applicationPath = (storageKey: string) => {
  if (!APPLICATION_KEY.test(storageKey)) {
    throw AppError.internal('Stored file path is invalid');
  }

  const root = path.resolve(uploadRoot);
  const target = path.resolve(root, storageKey);

  if (!target.startsWith(`${root}${path.sep}`)) {
    throw AppError.internal('Stored file path is invalid');
  }

  return target;
};

const storedPath = (storageKey: string, pattern: RegExp) => {
  if (!pattern.test(storageKey)) {
    throw AppError.internal('Stored image path is invalid');
  }

  const root = path.resolve(uploadRoot);
  const target = path.resolve(root, storageKey);

  if (!target.startsWith(`${root}${path.sep}`)) {
    throw AppError.internal('Stored image path is invalid');
  }

  return target;
};

const categoryPath = (storageKey: string) => storedPath(storageKey, CATEGORY_KEY);

const heroPath = (storageKey: string) => storedPath(storageKey, HERO_KEY);

const storePath = (storageKey: string) => storedPath(storageKey, STORE_KEY);

export const categoryImageStorageKey = (imageUrl: string) => {
  try {
    const match = CATEGORY_UPLOAD_PATH.exec(new URL(imageUrl).pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
};

export const heroImageStorageKey = (imageUrl: string) => {
  try {
    const match = HERO_UPLOAD_PATH.exec(new URL(imageUrl).pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
};

export const storeImageStorageKey = (imageUrl: string) => {
  try {
    const match = STORE_UPLOAD_PATH.exec(new URL(imageUrl).pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
};

const productImageStorageKey = (imageUrl: string) => {
  try {
    const match = PRODUCT_UPLOAD_PATH.exec(new URL(imageUrl).pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
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
  await mkdir(path.join(uploadRoot, 'categories'), { recursive: true });
  await mkdir(path.join(uploadRoot, 'hero'), { recursive: true });
  await mkdir(path.join(uploadRoot, 'stores'), { recursive: true });
};

const IMAGE_FOLDERS = {
  products: localPath,
  categories: categoryPath,
  hero: heroPath,
  stores: storePath,
} as const;

type ImageFolder = keyof typeof IMAGE_FOLDERS;

const persistImage = async (
  file: { buffer: Buffer; mimeType: string },
  folder: ImageFolder,
  profile: ImageOptimizeProfile,
): Promise<StoredImage> => {
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

  const optimized = await optimizeImage(file.buffer, mimeType, profile);
  const id = createImageId();
  const extension = PRODUCT_IMAGE_EXTENSIONS[optimized.mimeType];
  const storageKey = `${folder}/${id}${extension}`;
  const target = IMAGE_FOLDERS[folder](storageKey);

  await ensureUploadDir();

  try {
    await writeFile(target, optimized.buffer);
  } catch (error) {
    await unlink(target).catch(() => undefined);
    throw error;
  }

  return {
    id,
    provider: 'local',
    storageKey,
    url: `/uploads/${storageKey}`,
    mimeType: optimized.mimeType,
    size: optimized.buffer.length,
  };
};

// Local disk for now. The image id stays on the product if storage later moves
// to a platform that issues its own id; that platform id belongs in storageKey.
export const imageStorage = {
  async save(file: { buffer: Buffer; mimeType: string }): Promise<StoredImage> {
    return persistImage(file, 'products', 'catalog');
  },

  async readProductUpload(imageUrl: string): Promise<StoredImage> {
    const storageKey = productImageStorageKey(imageUrl);

    if (!storageKey) {
      throw AppError.validation('Upload the image before saving the product');
    }

    const extension = path.extname(storageKey);
    const mimeType = MIME_BY_EXTENSION[extension];
    const id = path.basename(storageKey, extension);

    if (!mimeType) {
      throw AppError.validation('Upload the image before saving the product');
    }

    let size = 0;

    try {
      const info = await stat(localPath(storageKey));

      if (!info.isFile()) {
        throw AppError.validation('Upload the image again before saving the product');
      }

      size = info.size;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw AppError.validation('Upload the image again before saving the product');
    }

    if (size < 1 || size > MAX_PRODUCT_IMAGE_BYTES) {
      throw AppError.validation('Upload the image again before saving the product');
    }

    return {
      id,
      provider: 'local',
      storageKey,
      url: `/uploads/${storageKey}`,
      mimeType,
      size,
    };
  },

  async saveCategoryImage(file: { buffer: Buffer; mimeType: string }): Promise<StoredImage> {
    return persistImage(file, 'categories', 'catalog');
  },

  async readHeroUpload(imageUrl: string): Promise<StoredImage> {
    const storageKey = heroImageStorageKey(imageUrl);

    if (!storageKey) {
      throw AppError.validation('Upload the hero image before saving', [
        { path: 'image', message: 'Upload the hero image before saving' },
      ]);
    }

    const extension = path.extname(storageKey);
    const mimeType = MIME_BY_EXTENSION[extension];
    const id = path.basename(storageKey, extension);

    if (!mimeType) {
      throw AppError.validation('Upload the hero image before saving', [
        { path: 'image', message: 'Upload the hero image before saving' },
      ]);
    }

    let size = 0;

    try {
      const info = await stat(heroPath(storageKey));

      if (!info.isFile()) {
        throw AppError.validation('Upload the hero image again before saving', [
          { path: 'image', message: 'Upload the hero image again before saving' },
        ]);
      }

      size = info.size;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw AppError.validation('Upload the hero image again before saving', [
        { path: 'image', message: 'Upload the hero image again before saving' },
      ]);
    }

    if (size < 1 || size > MAX_PRODUCT_IMAGE_BYTES) {
      throw AppError.validation('Upload the hero image again before saving', [
        { path: 'image', message: 'Upload the hero image again before saving' },
      ]);
    }

    return {
      id,
      provider: 'local',
      storageKey,
      url: `/uploads/${storageKey}`,
      mimeType,
      size,
    };
  },

  async saveHeroImage(file: { buffer: Buffer; mimeType: string }): Promise<StoredImage> {
    return persistImage(file, 'hero', 'hero');
  },

  async readStoreUpload(imageUrl: string, field: 'logo' | 'banner'): Promise<StoredImage> {
    const storageKey = storeImageStorageKey(imageUrl);
    const missing = (again = false) => {
      const message = again
        ? 'Upload the store image again before saving'
        : 'Upload the store image before saving';

      return AppError.validation(message, [{ path: field, message }]);
    };

    if (!storageKey) {
      throw missing();
    }

    const extension = path.extname(storageKey);
    const mimeType = MIME_BY_EXTENSION[extension];
    const id = path.basename(storageKey, extension);

    if (!mimeType) {
      throw missing();
    }

    let size = 0;

    try {
      const info = await stat(storePath(storageKey));

      if (!info.isFile()) {
        throw missing(true);
      }

      size = info.size;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw missing(true);
    }

    if (size < 1 || size > MAX_PRODUCT_IMAGE_BYTES) {
      throw missing(true);
    }

    return {
      id,
      provider: 'local',
      storageKey,
      url: `/uploads/${storageKey}`,
      mimeType,
      size,
    };
  },

  async saveStoreImage(
    file: { buffer: Buffer; mimeType: string },
    profile: ImageOptimizeProfile,
  ): Promise<StoredImage> {
    return persistImage(file, 'stores', profile);
  },

  async saveApplicationFile(file: { buffer: Buffer; mimeType: string }) {
    const mimeType = file.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';

    if (!isApplicationMimeType(mimeType)) {
      throw AppError.unsupportedMedia('Only JPEG, PNG, WebP, GIF, and PDF files are allowed');
    }

    if (file.buffer.length < 1 || file.buffer.length > MAX_PRODUCT_IMAGE_BYTES) {
      throw AppError.payloadTooLarge('Each file must be 5 MB or smaller');
    }

    const matches =
      mimeType === 'application/pdf'
        ? file.buffer.subarray(0, 4).toString('ascii') === '%PDF'
        : hasSignature(mimeType, file.buffer);

    if (!matches) {
      throw AppError.validation('File content does not match its type');
    }

    const optimized =
      mimeType === 'application/pdf'
        ? { buffer: file.buffer, mimeType }
        : await optimizeImage(file.buffer, mimeType, 'document');

    const id = `file_${randomBytes(12).toString('hex')}`;
    const storageKey = `applications/${id}${APPLICATION_EXTENSIONS[optimized.mimeType]}`;
    const target = applicationPath(storageKey);

    await mkdir(path.join(uploadRoot, 'applications'), { recursive: true });

    try {
      await writeFile(target, optimized.buffer);
    } catch (error) {
      await unlink(target).catch(() => undefined);
      throw error;
    }

    return {
      url: `/uploads/${storageKey}`,
      mimeType: optimized.mimeType,
    };
  },

  async removeHero(storageKey: string) {
    try {
      await unlink(heroPath(storageKey));
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

  async removeStore(storageKey: string) {
    try {
      await unlink(storePath(storageKey));
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

  async removeCategory(storageKey: string) {
    try {
      await unlink(categoryPath(storageKey));
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
