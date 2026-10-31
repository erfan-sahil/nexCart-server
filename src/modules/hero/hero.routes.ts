import { Router } from 'express';
import { Permission } from '../../common/constants/permissions';
import { heroController } from './hero.controller';
import { requirePermissions } from '../../common/middleware/authorize';
import { uploadHeroImage } from './upload-hero-image';
import { validate } from '../../common/middleware/validate';
import { heroIndexParamsSchema, setHeroActiveSchema, upsertHeroSchema } from './hero.validator';

export const heroRouter = Router();

heroRouter.get('/', heroController.getHero);

heroRouter.put(
  '/',
  ...requirePermissions(Permission.adminPlatformSettings),
  validate({ body: upsertHeroSchema }),
  heroController.upsertHero,
);

heroRouter.patch(
  '/:index',
  ...requirePermissions(Permission.adminPlatformSettings),
  validate({ params: heroIndexParamsSchema, body: setHeroActiveSchema }),
  heroController.setHeroActive,
);

heroRouter.post(
  '/image',
  ...requirePermissions(Permission.adminPlatformSettings),
  uploadHeroImage,
  heroController.uploadHeroImage,
);
