import { Router } from 'express';
import { Permission } from '../constants/permissions';
import { attributeController } from '../controllers/attribute.controller';
import { requirePermissions } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  attributeIdParamsSchema,
  createAttributeSchema,
  listAttributesQuerySchema,
  updateAttributeSchema,
} from '../validators/attribute.validator';

export const attributeRouter = Router();

attributeRouter.get(
  '/',
  validate({ query: listAttributesQuerySchema }),
  attributeController.listAttributes,
);

attributeRouter.post(
  '/',
  ...requirePermissions(Permission.attributeManage),
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
  ...requirePermissions(Permission.attributeManage),
  validate({ params: attributeIdParamsSchema, body: updateAttributeSchema }),
  attributeController.updateAttribute,
);

attributeRouter.delete(
  '/:id',
  ...requirePermissions(Permission.attributeManage),
  validate({ params: attributeIdParamsSchema }),
  attributeController.deleteAttribute,
);
