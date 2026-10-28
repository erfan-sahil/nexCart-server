import { z } from 'zod';
import { HERO_LIMITS } from '../constants/hero';

const hasControlCharacter = (value: string) => {
  for (const character of value) {
    const code = character.charCodeAt(0);

    if (code <= 31 || code === 127) {
      return true;
    }
  }

  return false;
};

const requiredText = (label: string, max: number) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`)
    .refine((value) => !hasControlCharacter(value), {
      message: `${label} cannot include line breaks or control characters`,
    });

const imageSchema = z
  .string({ error: 'Image is required' })
  .trim()
  .min(1, 'Image is required')
  .max(HERO_LIMITS.image, `Image URL must be ${HERO_LIMITS.image} characters or fewer`)
  .superRefine((value, ctx) => {
    let parsed: URL;

    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Image must be a valid URL' });
      return;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      ctx.addIssue({ code: 'custom', message: 'Image must be an http or https URL' });
    }

    if (parsed.username || parsed.password) {
      ctx.addIssue({ code: 'custom', message: 'Image URL cannot include credentials' });
    }
  });

const heroSlideSchema = z
  .object({
    eyebrow: requiredText('Eyebrow', HERO_LIMITS.eyebrow),
    title: requiredText('Title', HERO_LIMITS.title),
    description: requiredText('Description', HERO_LIMITS.description),
    image: imageSchema,
    isActive: z.boolean({ error: 'Active status is required' }),
  })
  .strict();

export const upsertHeroSchema = z
  .object({
    slides: z
      .array(heroSlideSchema, { error: 'Heroes are required' })
      .max(HERO_LIMITS.slides, `Add ${HERO_LIMITS.slides} heroes or fewer`),
  })
  .strict()
  .superRefine((value, ctx) => {
    const active = value.slides.filter((slide) => slide.isActive).length;

    if (active > HERO_LIMITS.active) {
      ctx.addIssue({
        code: 'custom',
        path: ['slides'],
        message: `Only ${HERO_LIMITS.active} heroes can be active at once`,
      });
    }
  });

export type UpsertHeroInput = z.infer<typeof upsertHeroSchema>;

export const heroIndexParamsSchema = z
  .object({
    index: z.coerce
      .number()
      .int()
      .min(0)
      .max(HERO_LIMITS.slides - 1),
  })
  .strict();

export const setHeroActiveSchema = z
  .object({
    isActive: z.boolean({ error: 'Active status is required' }),
  })
  .strict();

export type HeroIndexParams = z.infer<typeof heroIndexParamsSchema>;
export type SetHeroActiveInput = z.infer<typeof setHeroActiveSchema>;
