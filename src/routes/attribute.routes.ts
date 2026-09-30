import { Router } from 'express';
import { attributeController } from '../controllers/attribute.controller';
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
  validate({ params: attributeIdParamsSchema, body: updateAttributeSchema }),
  attributeController.updateAttribute,
);

attributeRouter.delete(
  '/:id',
  validate({ params: attributeIdParamsSchema }),
  attributeController.deleteAttribute,
);
