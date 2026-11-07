import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { env } from '../../config/env';
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
import {
  deleteFromCloudinary,
  findCloudinaryAsset,
  parseCloudinaryUrl,
  uploadToCloudinary,
} from './cloudinaryStorage';

export type StoredImage = {
  id: string;
  provider: ImageProvider;
  storageKey: string;
  url: string;
  mimeType: ProductImageMimeType;
  size: number;
};

type ImageFolder = 'products' | 'categories' | 'hero' | 'stores';

type ImageLocation = {
  provider: ImageProvider;
  storageKey: string;
  id: string;
  mimeType: ProductImageMimeType;
};

const IMAGE_FOLDERS: readonly ImageFolder[] = ['products', 'categories', 'hero', 'stores'];

const IMAGE_ID = 'img_[a-f0-9]{24}';
const LOCAL_IMAGE_KEYS: Record<ImageFolder, RegExp> = {
  products: new RegExp(`^products/${IMAGE_ID}\\.(?:jpg|png|webp|gif)$`),
  categories: new RegExp(`^categories/${IMAGE_ID}\\.(?:jpg|png|webp|gif)$`),
  hero: new RegExp(`^hero/${IMAGE_ID}\\.(?:jpg|png|webp|gif)$`),
  stores: new RegExp(`^stores/${IMAGE_ID}\\.(?:jpg|png|webp|gif)$`),
};
const CLOUD_IMAGE_KEYS: Record<ImageFolder, RegExp> = {
  products: new RegExp(`^${env.CLOUDINARY_FOLDER}/products/${IMAGE_ID}$`),
  categories: new RegExp(`^${env.CLOUDINARY_FOLDER}/categories/${IMAGE_ID}$`),
  hero: new RegExp(`^${env.CLOUDINARY_FOLDER}/hero/${IMAGE_ID}$`),
  stores: new RegExp(`^${env.CLOUDINARY_FOLDER}/stores/${IMAGE_ID}$`),
};

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

const useCloudinary = () => env.IMAGE_STORAGE_DRIVER === 'cloudinary';

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

const resolveInsideUploadRoot = (storageKey: string, pattern: RegExp, message: string) => {
  if (!pattern.test(storageKey)) {
    throw AppError.internal(message);
  }

  const root = path.resolve(uploadRoot);
  const target = path.resolve(root, storageKey);

  if (!target.startsWith(`${root}${path.sep}`)) {
    throw AppError.internal(message);
  }

  return target;
};

const localImagePath = (storageKey: string, folder: ImageFolder) =>
  resolveInsideUploadRoot(storageKey, LOCAL_IMAGE_KEYS[folder], 'Stored image path is invalid');

const applicationPath = (storageKey: string) =>
  resolveInsideUploadRoot(storageKey, APPLICATION_KEY, 'Stored file path is invalid');

const isMissingFileError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';

const locateImage = (imageUrl: string, folder: ImageFolder): ImageLocation | null => {
  const cloud = parseCloudinaryUrl(imageUrl);

  if (cloud) {
    const mimeType = MIME_BY_EXTENSION[`.${cloud.extension}`];

    if (!mimeType || !CLOUD_IMAGE_KEYS[folder].test(cloud.publicId)) {
      return null;
    }

    return {
      provider: 'cloudinary',
      storageKey: cloud.publicId,
      id: path.posix.basename(cloud.publicId),
      mimeType,
    };
  }

  let pathname = '';

  try {
    pathname = new URL(imageUrl).pathname;
  } catch {
    return null;
  }

  const storageKey = pathname.startsWith('/uploads/') ? pathname.slice('/uploads/'.length) : '';
  const extension = path.extname(storageKey);
  const mimeType = MIME_BY_EXTENSION[extension];

  if (!mimeType || !LOCAL_IMAGE_KEYS[folder].test(storageKey)) {
    return null;
  }

  return {
    provider: 'local',
    storageKey,
    id: path.basename(storageKey, extension),
    mimeType,
  };
};

const inspectImage = async (
  location: ImageLocation,
  folder: ImageFolder,
): Promise<{ url: string; size: number; mimeType: ProductImageMimeType } | null> => {
  if (location.provider === 'cloudinary') {
    const asset = await findCloudinaryAsset(location.storageKey);

    if (!asset) {
      return null;
    }

    return {
      url: asset.url,
      size: asset.bytes,
      mimeType: MIME_BY_EXTENSION[`.${asset.format}`] ?? location.mimeType,
    };
  }

  try {
    const info = await stat(localImagePath(location.storageKey, folder));

    return info.isFile()
      ? { url: `/uploads/${location.storageKey}`, size: info.size, mimeType: location.mimeType }
      : null;
  } catch {
    return null;
  }
};

// Resolves an image URL returned by an upload endpoint back to the stored file, so records can only
// reference images this API stored itself.
const readUploadedImage = async (
  imageUrl: string,
  folder: ImageFolder,
  missing: (again: boolean) => AppError,
): Promise<StoredImage> => {
  const location = locateImage(imageUrl, folder);

  if (!location) {
    throw missing(false);
  }

  const found = await inspectImage(location, folder);

  if (!found || found.size < 1 || found.size > MAX_PRODUCT_IMAGE_BYTES) {
    throw missing(true);
  }

  return {
    id: location.id,
    provider: location.provider,
    storageKey: location.storageKey,
    url: found.url,
    mimeType: found.mimeType,
    size: found.size,
  };
};

const removeImage = async (storageKey: string, folder: ImageFolder) => {
  if (CLOUD_IMAGE_KEYS[folder].test(storageKey)) {
    await deleteFromCloudinary(storageKey);
    return;
  }

  try {
    await unlink(localImagePath(storageKey, folder));
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }

    throw error;
  }
};

const writeLocalFile = async (target: string, buffer: Buffer) => {
  try {
    await writeFile(target, buffer);
  } catch (error) {
    await unlink(target).catch(() => undefined);
    throw error;
  }
};

export const ensureUploadDir = async () => {
  await Promise.all(
    IMAGE_FOLDERS.map((folder) => mkdir(path.join(uploadRoot, folder), { recursive: true })),
  );
};

export const categoryImageStorageKey = (imageUrl: string) =>
  locateImage(imageUrl, 'categories')?.storageKey ?? null;

export const heroImageStorageKey = (imageUrl: string) =>
  locateImage(imageUrl, 'hero')?.storageKey ?? null;

export const storeImageStorageKey = (imageUrl: string) =>
  locateImage(imageUrl, 'stores')?.storageKey ?? null;

// True for URLs served by this API's storage (local uploads or this Cloudinary cloud), which must be
// verified before saving. Other http(s) URLs are external images and are stored as-is.
export const isManagedImageUrl = (imageUrl: string) => {
  if (parseCloudinaryUrl(imageUrl)) {
    return true;
  }

  try {
    return new URL(imageUrl).pathname.startsWith('/uploads/');
  } catch {
    return false;
  }
};

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

  if (useCloudinary()) {
    const asset = await uploadToCloudinary(optimized.buffer, { folder, id });

    if (!CLOUD_IMAGE_KEYS[folder].test(asset.publicId)) {
      await deleteFromCloudinary(asset.publicId).catch(() => undefined);
      throw AppError.internal('Cloudinary stored the image under an unexpected id');
    }

    return {
      id,
      provider: 'cloudinary',
      storageKey: asset.publicId,
      url: asset.url,
      mimeType: optimized.mimeType,
      size: asset.bytes,
    };
  }

  const storageKey = `${folder}/${id}${PRODUCT_IMAGE_EXTENSIONS[optimized.mimeType]}`;
  const target = localImagePath(storageKey, folder);

  await ensureUploadDir();
  await writeLocalFile(target, optimized.buffer);

  return {
    id,
    provider: 'local',
    storageKey,
    url: `/uploads/${storageKey}`,
    mimeType: optimized.mimeType,
    size: optimized.buffer.length,
  };
};

export const imageStorage = {
  async save(file: { buffer: Buffer; mimeType: string }): Promise<StoredImage> {
    return persistImage(file, 'products', 'catalog');
  },

  async readProductUpload(imageUrl: string): Promise<StoredImage> {
    return readUploadedImage(imageUrl, 'products', (again) =>
      AppError.validation(
        again
          ? 'Upload the image again before saving the product'
          : 'Upload the image before saving the product',
      ),
    );
  },

  async saveCategoryImage(file: { buffer: Buffer; mimeType: string }): Promise<StoredImage> {
    return persistImage(file, 'categories', 'catalog');
  },

  async readHeroUpload(imageUrl: string): Promise<StoredImage> {
    return readUploadedImage(imageUrl, 'hero', (again) => {
      const message = again
        ? 'Upload the hero image again before saving'
        : 'Upload the hero image before saving';

      return AppError.validation(message, [{ path: 'image', message }]);
    });
  },

  async saveHeroImage(file: { buffer: Buffer; mimeType: string }): Promise<StoredImage> {
    return persistImage(file, 'hero', 'hero');
  },

  async readStoreUpload(imageUrl: string, field: 'logo' | 'banner'): Promise<StoredImage> {
    return readUploadedImage(imageUrl, 'stores', (again) => {
      const message = again
        ? 'Upload the store image again before saving'
        : 'Upload the store image before saving';

      return AppError.validation(message, [{ path: field, message }]);
    });
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
    const extension = APPLICATION_EXTENSIONS[optimized.mimeType];

    if (useCloudinary() && optimized.mimeType !== 'application/pdf') {
      const asset = await uploadToCloudinary(optimized.buffer, { folder: 'applications', id });

      return { url: asset.url, mimeType: optimized.mimeType };
    }

    // PDFs stay on local disk: Cloudinary accounts deny PDF delivery unless it is enabled under
    // Settings > Security, and a stored-but-undeliverable document would break vendor reviews.
    const storageKey = `applications/${id}${extension}`;
    const target = applicationPath(storageKey);

    await mkdir(path.join(uploadRoot, 'applications'), { recursive: true });
    await writeLocalFile(target, optimized.buffer);

    return {
      url: `/uploads/${storageKey}`,
      mimeType: optimized.mimeType,
    };
  },

  async removeHero(storageKey: string) {
    await removeImage(storageKey, 'hero');
  },

  async removeStore(storageKey: string) {
    await removeImage(storageKey, 'stores');
  },

  async removeCategory(storageKey: string) {
    await removeImage(storageKey, 'categories');
  },

  async remove(storageKey: string) {
    await removeImage(storageKey, 'products');
  },
};
