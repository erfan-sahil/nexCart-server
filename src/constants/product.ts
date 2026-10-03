export const PRODUCT_STATUSES = ['draft', 'active', 'archived'] as const;

export const IMAGE_PROVIDERS = ['local'] as const;

export const PRODUCT_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const PRODUCT_IMAGE_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
} as const satisfies Record<(typeof PRODUCT_IMAGE_MIME_TYPES)[number], string>;

export const PRODUCT_IMAGE_ID = /^img_[a-f0-9]{24}$/;

export const MAX_PRODUCT_IMAGES = 8;

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

export type ProductImageMimeType = (typeof PRODUCT_IMAGE_MIME_TYPES)[number];

export const isProductImageMimeType = (value: string): value is ProductImageMimeType =>
  (PRODUCT_IMAGE_MIME_TYPES as readonly string[]).includes(value);
