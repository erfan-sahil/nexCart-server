import { Router } from 'express';
import { Permission } from '../constants/permissions';
import { heroController } from '../controllers/hero.controller';
import { requirePermissions } from '../middleware/authorize';
import { uploadHeroImage } from '../middleware/uploadHeroImage';
import { validate } from '../middleware/validate';
import { upsertHeroSchema } from '../validators/hero.validator';

export const heroRouter = Router();

heroRouter.get('/', heroController.getHero);

heroRouter.put(
  '/',
  ...requirePermissions(Permission.adminPlatformSettings),
  validate({ body: upsertHeroSchema }),
  heroController.upsertHero,
);

heroRouter.post(
  '/image',
  ...requirePermissions(Permission.adminPlatformSettings),
  uploadHeroImage,
  heroController.uploadHeroImage,
);
