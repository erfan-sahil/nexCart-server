import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { env } from '../config/env';
import { uploadRoot } from '../config/uploads';
import {
  findCloudinaryAsset,
  uploadToCloudinary,
} from '../infrastructure/storage/cloudinaryStorage';
import type { ImageRecolor } from './productSeed';

const FOLDER = 'products';
const MAX_EDGE = 1200;
const QUALITY = 80;

export type RecoloredImage = {
  provider: 'local' | 'cloudinary';
  storageKey: string;
  url: string;
  mimeType: 'image/webp';
  size: number;
};

const sources = new Map<string, Promise<Buffer>>();

async function download(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not download ${url} (${response.status})`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/** Colorways of one product share a base photo, so each source is fetched once per run. */
const sourceImage = (url: string) => {
  let pending = sources.get(url);

  if (!pending) {
    pending = download(url);
    sources.set(url, pending);
  }

  return pending;
};

const normalizedHue = (hue: number) => Math.round(((hue % 360) + 360) % 360);

/** Content-addressed, so re-running the seed reuses stored files and tuning a colorway re-renders it. */
const assetIdFor = (url: string, recolor: ImageRecolor) =>
  `img_${createHash('sha256')
    .update(
      JSON.stringify([
        url,
        normalizedHue(recolor.hue),
        recolor.brightness ?? 1,
        recolor.saturation ?? 1,
      ]),
    )
    .digest('hex')
    .slice(0, 24)}`;

async function render(url: string, recolor: ImageRecolor) {
  return sharp(await sourceImage(url))
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .modulate({
      hue: normalizedHue(recolor.hue),
      brightness: recolor.brightness ?? 1,
      saturation: recolor.saturation ?? 1,
    })
    .webp({ quality: QUALITY, effort: 4, smartSubsample: true })
    .toBuffer();
}

async function storeInCloudinary(id: string, url: string, recolor: ImageRecolor) {
  const publicId = `${env.CLOUDINARY_FOLDER}/${FOLDER}/${id}`;
  const asset =
    (await findCloudinaryAsset(publicId)) ??
    (await uploadToCloudinary(await render(url, recolor), { folder: FOLDER, id }));

  return {
    provider: 'cloudinary' as const,
    storageKey: asset.publicId,
    url: asset.url,
    mimeType: 'image/webp' as const,
    size: asset.bytes,
  };
}

async function storeLocally(id: string, url: string, recolor: ImageRecolor) {
  const storageKey = `${FOLDER}/${id}.webp`;
  const target = path.join(uploadRoot, storageKey);
  let size = await stat(target).then(
    (info) => info.size,
    () => 0,
  );

  if (size === 0) {
    const buffer = await render(url, recolor);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer);
    size = buffer.length;
  }

  return {
    provider: 'local' as const,
    storageKey,
    url: `/uploads/${storageKey}`,
    mimeType: 'image/webp' as const,
    size,
  };
}

/** Renders a colorway of a product photo by rotating its hue, then stores it like an upload. */
export function recolorImage(url: string, recolor: ImageRecolor): Promise<RecoloredImage> {
  const id = assetIdFor(url, recolor);

  return env.IMAGE_STORAGE_DRIVER === 'cloudinary'
    ? storeInCloudinary(id, url, recolor)
    : storeLocally(id, url, recolor);
}
