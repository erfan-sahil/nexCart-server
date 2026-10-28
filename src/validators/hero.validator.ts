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

export const upsertHeroSchema = z
  .object({
    eyebrow: requiredText('Eyebrow', HERO_LIMITS.eyebrow),
    title: requiredText('Title', HERO_LIMITS.title),
    description: requiredText('Description', HERO_LIMITS.description),
    image: imageSchema,
  })
  .strict();

export type UpsertHeroInput = z.infer<typeof upsertHeroSchema>;
