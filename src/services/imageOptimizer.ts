import sharp from 'sharp';
import type { ProductImageMimeType } from '../constants/product';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

const MAX_INPUT_PIXELS = 40_000_000;

export const IMAGE_OPTIMIZE_PROFILES = {
  catalog: { maxEdge: 1600, quality: 78 },
  hero: { maxEdge: 2400, quality: 80 },
  document: { maxEdge: 2000, quality: 85 },
} as const;

export type ImageOptimizeProfile = keyof typeof IMAGE_OPTIMIZE_PROFILES;

export type OptimizedImage = {
  buffer: Buffer;
  mimeType: ProductImageMimeType;
};

const readMetadata = async (source: Buffer) => {
  try {
    return await sharp(source, {
      animated: true,
      failOn: 'none',
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
  } catch (error) {
    logger.warn('Could not read image metadata', { err: error });
    throw AppError.validation('Could not process this image');
  }
};

const pipeline = (source: Buffer, animated: boolean, maxEdge: number) => {
  const image = sharp(source, {
    animated,
    failOn: 'none',
    limitInputPixels: MAX_INPUT_PIXELS,
    ...(animated ? { pages: -1 } : {}),
  });

  const oriented = animated ? image : image.rotate();

  return oriented.resize({
    width: maxEdge,
    height: maxEdge,
    fit: 'inside',
    withoutEnlargement: true,
  });
};

const encodeWebp = (source: Buffer, animated: boolean, maxEdge: number, quality: number) =>
  pipeline(source, animated, maxEdge).webp({ quality, effort: 4, smartSubsample: true }).toBuffer();

const encodeOriginal = (
  source: Buffer,
  mimeType: ProductImageMimeType,
  animated: boolean,
  maxEdge: number,
  quality: number,
) => {
  const image = pipeline(source, animated, maxEdge);

  if (mimeType === 'image/jpeg') {
    return image.jpeg({ quality, mozjpeg: true, progressive: true }).toBuffer();
  }

  if (mimeType === 'image/png') {
    return image.png({ compressionLevel: 9 }).toBuffer();
  }

  if (mimeType === 'image/gif') {
    return image.gif({ effort: 7 }).toBuffer();
  }

  return image.webp({ quality, effort: 4, smartSubsample: true }).toBuffer();
};

const smaller = (current: OptimizedImage, candidate: OptimizedImage) =>
  candidate.buffer.length < current.buffer.length ? candidate : current;

// Returns the original bytes when compression would not make the file smaller.
export const optimizeImage = async (
  source: Buffer,
  mimeType: ProductImageMimeType,
  profile: ImageOptimizeProfile,
): Promise<OptimizedImage> => {
  const { maxEdge, quality } = IMAGE_OPTIMIZE_PROFILES[profile];
  const metadata = await readMetadata(source);
  const width = metadata.width ?? 0;
  const pages = metadata.pages ?? 1;
  const height = pages > 1 ? (metadata.pageHeight ?? metadata.height ?? 0) : (metadata.height ?? 0);

  if (width < 1 || height < 1) {
    throw AppError.validation('Could not process this image');
  }

  const animated = pages > 1;
  const original: OptimizedImage = { buffer: source, mimeType };

  try {
    const webp = await encodeWebp(source, animated, maxEdge, quality);
    let best = smaller(original, { buffer: webp, mimeType: 'image/webp' });

    if (best === original && mimeType !== 'image/webp') {
      const recompressed = await encodeOriginal(source, mimeType, animated, maxEdge, quality);
      best = smaller(best, { buffer: recompressed, mimeType });
    }

    return best;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    logger.warn('Image optimization failed', { err: error });
    throw AppError.validation('Could not process this image');
  }
};
