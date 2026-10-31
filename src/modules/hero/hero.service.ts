import { HERO_KEY, HERO_LIMITS } from './constants';
import { HeroModel } from './hero.model';
import { AppError } from '../../common/errors/AppError';
import { isDuplicateKeyError } from '../../common/errors/mongoError';
import { heroImageStorageKey, imageStorage } from '../../infrastructure/storage/imageStorage';

type HeroSlide = {
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  isActive: boolean;
};

type HeroSection = {
  slides: HeroSlide[];
};

type StoredSlide = {
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  isActive?: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const readSlide = (value: unknown): StoredSlide | null => {
  if (!isRecord(value)) {
    return null;
  }

  const eyebrow = readString(value.eyebrow);
  const title = readString(value.title);
  const description = readString(value.description);
  const image = readString(value.image);

  if (!eyebrow || !title || !description || !image) {
    return null;
  }

  return {
    eyebrow,
    title,
    description,
    image,
    isActive: typeof value.isActive === 'boolean' ? value.isActive : undefined,
  };
};

const toSlides = (records: readonly StoredSlide[]): HeroSlide[] => {
  let active = 0;

  return records.map((record) => {
    const requested = record.isActive !== false;
    const isActive = requested && active < HERO_LIMITS.active;

    if (isActive) {
      active += 1;
    }

    return {
      eyebrow: record.eyebrow,
      title: record.title,
      description: record.description,
      image: record.image,
      isActive,
    };
  });
};

const slidesFromDocument = (value: unknown): HeroSlide[] => {
  if (!isRecord(value)) {
    return [];
  }

  if (Array.isArray(value.slides)) {
    return toSlides(
      value.slides.flatMap((item) => {
        const slide = readSlide(item);
        return slide ? [slide] : [];
      }),
    );
  }

  const legacy = readSlide(value);
  return legacy ? toSlides([legacy]) : [];
};

const imageFieldError = (index: number, message: string) =>
  AppError.validation(message, [{ path: `slides.${index}.image`, message }]);

const assertImageAvailable = async (imageUrl: string, index: number) => {
  let pathname = '';

  try {
    pathname = new URL(imageUrl).pathname;
  } catch {
    throw imageFieldError(index, 'Image must be a valid URL');
  }

  if (!pathname.startsWith('/uploads/')) {
    return;
  }

  if (!heroImageStorageKey(imageUrl)) {
    throw imageFieldError(index, 'Upload the hero image before saving');
  }

  try {
    await imageStorage.readHeroUpload(imageUrl);
  } catch (error) {
    if (error instanceof AppError && error.details?.[0]) {
      throw imageFieldError(index, error.details[0].message);
    }

    throw error;
  }
};

const removeStoredHeroImage = async (imageUrl: string) => {
  const storageKey = heroImageStorageKey(imageUrl);

  if (!storageKey) {
    return;
  }

  await imageStorage.removeHero(storageKey).catch(() => undefined);
};

const previousImages = (value: unknown) => {
  if (!isRecord(value)) {
    return [];
  }

  const images = Array.isArray(value.slides)
    ? value.slides.flatMap((item) => {
        const slide = readSlide(item);
        return slide ? [slide.image] : [];
      })
    : [];
  const legacy = readString(value.image);

  return legacy ? [...images, legacy] : images;
};

const saveHero = async (slides: HeroSlide[]) => {
  try {
    return await HeroModel.findOneAndUpdate(
      { key: HERO_KEY },
      { $set: { slides }, $setOnInsert: { key: HERO_KEY } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    return HeroModel.findOneAndUpdate(
      { key: HERO_KEY },
      { $set: { slides } },
      { new: true, runValidators: true },
    ).lean();
  }
};

const assertActiveLimit = (slides: readonly HeroSlide[]) => {
  const active = slides.filter((slide) => slide.isActive).length;

  if (active > HERO_LIMITS.active) {
    throw AppError.validation(`Only ${HERO_LIMITS.active} heroes can be active at once`, [
      {
        path: 'slides',
        message: `Only ${HERO_LIMITS.active} heroes can be active at once`,
      },
    ]);
  }
};

export const heroService = {
  async get(): Promise<HeroSection> {
    const hero: unknown = await HeroModel.findOne({ key: HERO_KEY }).lean();

    return { slides: slidesFromDocument(hero) };
  },

  async upsert(input: HeroSection): Promise<HeroSection> {
    const slides: HeroSlide[] = input.slides.map((slide) => ({
      eyebrow: slide.eyebrow,
      title: slide.title,
      description: slide.description,
      image: slide.image,
      isActive: slide.isActive,
    }));

    assertActiveLimit(slides);
    await Promise.all(slides.map((slide, index) => assertImageAvailable(slide.image, index)));

    const existing: unknown = await HeroModel.findOne({ key: HERO_KEY }).lean();
    const storedImages = previousImages(existing);
    const hero = await saveHero(slides);

    if (!hero) {
      throw AppError.internal('Could not save the hero section');
    }

    const nextImages = new Set(slides.map((slide) => slide.image));

    await Promise.all(
      storedImages
        .filter((image, index, images) => images.indexOf(image) === index)
        .filter((image) => !nextImages.has(image))
        .map((image) => removeStoredHeroImage(image)),
    );

    return { slides };
  },

  async setActive(index: number, isActive: boolean): Promise<HeroSection> {
    const existing: unknown = await HeroModel.findOne({ key: HERO_KEY }).lean();
    const slides = slidesFromDocument(existing);
    const slide = slides[index];

    if (!slide) {
      throw AppError.notFound('Hero not found');
    }

    if (slide.isActive === isActive) {
      return { slides };
    }

    const next = slides.map((item, itemIndex) =>
      itemIndex === index ? { ...item, isActive } : item,
    );

    assertActiveLimit(next);
    const hero = await saveHero(next);

    if (!hero) {
      throw AppError.internal('Could not update the hero');
    }

    return { slides: next };
  },
};
