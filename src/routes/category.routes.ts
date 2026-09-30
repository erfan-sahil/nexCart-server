import { Router } from 'express';
import { categoryController } from '../controllers/category.controller';
import { validate } from '../middleware/validate';
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
  validate({ body: createCategorySchema }),
  categoryController.createCategory,
);

categoryRouter.get(
  '/:id',
  validate({ params: categoryIdParamsSchema }),
  categoryController.getCategory,
);

categoryRouter.patch(
  '/:id',
  validate({ params: categoryIdParamsSchema, body: updateCategorySchema }),
  categoryController.updateCategory,
);

categoryRouter.delete(
  '/:id',
  validate({ params: categoryIdParamsSchema }),
  categoryController.deleteCategory,
);
