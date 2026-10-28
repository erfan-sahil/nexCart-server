import { HERO_KEY } from '../constants/hero';
import { HeroModel } from '../models/hero.model';
import type { HeroDto } from '../types/hero';
import { AppError } from '../utils/AppError';
import { isDuplicateKeyError } from '../utils/mongoError';
import type { UpsertHeroInput } from '../validators/hero.validator';
import { heroImageStorageKey, imageStorage } from './imageStorage';

type HeroRecord = {
  eyebrow: string;
  title: string;
  description: string;
  image: string;
};

const toDto = (record: HeroRecord): HeroDto => ({
  eyebrow: record.eyebrow,
  title: record.title,
  description: record.description,
  image: record.image,
});

const imageFieldError = (message: string) =>
  AppError.validation(message, [{ path: 'image', message }]);

const assertImageAvailable = async (imageUrl: string) => {
  let pathname = '';

  try {
    pathname = new URL(imageUrl).pathname;
  } catch {
    throw imageFieldError('Image must be a valid URL');
  }

  if (!pathname.startsWith('/uploads/')) {
    return;
  }

  if (!heroImageStorageKey(imageUrl)) {
    throw imageFieldError('Upload the hero image before saving');
  }

  await imageStorage.readHeroUpload(imageUrl);
};

const removeStoredHeroImage = async (imageUrl: string) => {
  const storageKey = heroImageStorageKey(imageUrl);

  if (!storageKey) {
    return;
  }

  await imageStorage.removeHero(storageKey).catch(() => undefined);
};

const saveHero = async (input: UpsertHeroInput) => {
  const update = {
    eyebrow: input.eyebrow,
    title: input.title,
    description: input.description,
    image: input.image,
  };

  try {
    return await HeroModel.findOneAndUpdate(
      { key: HERO_KEY },
      { $set: update, $setOnInsert: { key: HERO_KEY } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    return HeroModel.findOneAndUpdate(
      { key: HERO_KEY },
      { $set: update },
      { new: true, runValidators: true },
    ).lean();
  }
};

export const heroService = {
  async get(): Promise<HeroDto> {
    const hero = await HeroModel.findOne({ key: HERO_KEY }).lean();

    if (!hero) {
      throw AppError.notFound('Hero section not found');
    }

    return toDto(hero);
  },

  async upsert(input: UpsertHeroInput): Promise<HeroDto> {
    await assertImageAvailable(input.image);

    const existing = await HeroModel.findOne({ key: HERO_KEY }).select('image').lean();
    const previousImage = existing?.image;
    const hero = await saveHero(input);

    if (!hero) {
      throw AppError.internal('Could not save the hero section');
    }

    if (previousImage && previousImage !== input.image) {
      await removeStoredHeroImage(previousImage);
    }

    return toDto(hero);
  },
};
