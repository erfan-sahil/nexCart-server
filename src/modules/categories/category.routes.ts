import { Router } from 'express';
import { Permission } from '../../common/constants/permissions';
import { attributeController } from '../attributes/attribute.controller';
import { categoryController } from './category.controller';
import { requirePermissions } from '../../common/middleware/authorize';
import { uploadCategoryImage } from './upload-category-image';
import { validate } from '../../common/middleware/validate';
import { replaceCategoryAttributesSchema } from '../attributes/attribute.validator';
import {
  categoryIdParamsSchema,
  categorySlugParamsSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  treeCategoriesQuerySchema,
  updateCategorySchema,
} from './category.validator';

export const categoryRouter = Router();

categoryRouter.get(
  '/tree',
  validate({ query: treeCategoriesQuerySchema }),
  categoryController.treeCategories,
);

categoryRouter.get(
  '/slug/:slug',
  validate({ params: categorySlugParamsSchema }),
  categoryController.getCategoryBySlug,
);

categoryRouter.get(
  '/',
  validate({ query: listCategoriesQuerySchema }),
  categoryController.listCategories,
);

categoryRouter.post(
  '/',
  ...requirePermissions(Permission.adminCategories),
  validate({ body: createCategorySchema }),
  categoryController.createCategory,
);

categoryRouter.post(
  '/image',
  ...requirePermissions(Permission.adminCategories),
  uploadCategoryImage,
  categoryController.uploadCategoryImage,
);

categoryRouter.get(
  '/:id/attributes',
  validate({ params: categoryIdParamsSchema }),
  attributeController.listCategoryAttributes,
);

categoryRouter.put(
  '/:id/attributes',
  ...requirePermissions(Permission.adminAttributes),
  validate({ params: categoryIdParamsSchema, body: replaceCategoryAttributesSchema }),
  attributeController.replaceCategoryAttributes,
);

categoryRouter.get(
  '/:id',
  validate({ params: categoryIdParamsSchema }),
  categoryController.getCategory,
);

categoryRouter.patch(
  '/:id',
  ...requirePermissions(Permission.adminCategories),
  validate({ params: categoryIdParamsSchema, body: updateCategorySchema }),
  categoryController.updateCategory,
);

categoryRouter.delete(
  '/:id',
  ...requirePermissions(Permission.adminCategories),
  validate({ params: categoryIdParamsSchema }),
  categoryController.deleteCategory,
);
