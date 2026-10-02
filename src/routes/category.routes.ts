import { Router } from 'express';
import { Permission } from '../constants/permissions';
import { attributeController } from '../controllers/attribute.controller';
import { categoryController } from '../controllers/category.controller';
import { requirePermissions } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { replaceCategoryAttributesSchema } from '../validators/attribute.validator';
import {
  categoryIdParamsSchema,
  categorySlugParamsSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  treeCategoriesQuerySchema,
  updateCategorySchema,
} from '../validators/category.validator';

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
  ...requirePermissions(Permission.categoryManage),
  validate({ body: createCategorySchema }),
  categoryController.createCategory,
);

categoryRouter.get(
  '/:id/attributes',
  validate({ params: categoryIdParamsSchema }),
  attributeController.listCategoryAttributes,
);

categoryRouter.put(
  '/:id/attributes',
  ...requirePermissions(Permission.attributeManage),
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
  ...requirePermissions(Permission.categoryManage),
  validate({ params: categoryIdParamsSchema, body: updateCategorySchema }),
  categoryController.updateCategory,
);

categoryRouter.delete(
  '/:id',
  ...requirePermissions(Permission.categoryManage),
  validate({ params: categoryIdParamsSchema }),
  categoryController.deleteCategory,
);
