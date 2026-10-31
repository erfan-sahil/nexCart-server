import { Router } from 'express';
import { Permission } from '../../common/constants/permissions';
import { attributeController } from './attribute.controller';
import { requirePermissions } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import {
  attributeIdParamsSchema,
  createAttributeSchema,
  listAttributesQuerySchema,
  updateAttributeSchema,
} from './attribute.validator';

export const attributeRouter = Router();

attributeRouter.get(
  '/',
  validate({ query: listAttributesQuerySchema }),
  attributeController.listAttributes,
);

attributeRouter.post(
  '/',
  ...requirePermissions(Permission.adminAttributes),
  validate({ body: createAttributeSchema }),
  attributeController.createAttribute,
);

attributeRouter.get(
  '/:id',
  validate({ params: attributeIdParamsSchema }),
  attributeController.getAttribute,
);

attributeRouter.patch(
  '/:id',
  ...requirePermissions(Permission.adminAttributes),
  validate({ params: attributeIdParamsSchema, body: updateAttributeSchema }),
  attributeController.updateAttribute,
);

attributeRouter.delete(
  '/:id',
  ...requirePermissions(Permission.adminAttributes),
  validate({ params: attributeIdParamsSchema }),
  attributeController.deleteAttribute,
);
