import type { Request, Response } from 'express';
import { categoryService } from '../services/category.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/sendResponse';
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  TreeCategoriesQuery,
  UpdateCategoryInput,
} from '../validators/category.validator';

const routeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListCategoriesQuery;
  const result = await categoryService.list(query);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const treeCategories = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as TreeCategoriesQuery;
  const tree = await categoryService.tree(query.isActive);

  sendSuccess(res, tree, { message: 'Category tree fetched' });
});

const getCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.getById(routeParam(req.params.id));

  sendSuccess(res, category, { message: 'Category fetched' });
});

const getCategoryBySlug = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.getBySlug(routeParam(req.params.slug));

  sendSuccess(res, category, { message: 'Category fetched' });
});

const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.create(req.body as CreateCategoryInput);

  sendCreated(res, category, 'Category created');
});

const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.update(
    routeParam(req.params.id),
    req.body as UpdateCategoryInput,
  );

  sendSuccess(res, category, { message: 'Category updated' });
});

const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const result = await categoryService.remove(routeParam(req.params.id));

  sendSuccess(res, result, { message: 'Category deleted' });
});

export const categoryController = {
  listCategories,
  treeCategories,
  getCategory,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
};
