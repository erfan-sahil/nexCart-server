import type { Request, Response } from 'express';
import { categoryService } from './category.service';
import { imageStorage } from '../../infrastructure/storage/imageStorage';
import { AppError } from '../../common/errors/AppError';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendCreated, sendPaginated, sendSuccess } from '../../common/http/sendResponse';
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  SetCategoryFeaturedInput,
  TreeCategoriesQuery,
  UpdateCategoryInput,
  UpdateFeaturedOrderInput,
} from './category.validator';

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

const absoluteUploadUrl = (req: Request, url: string) => {
  const host = req.get('host');

  if (!host) {
    throw AppError.internal('Could not build the file URL');
  }

  return `${req.protocol}://${host}${url}`;
};

const uploadCategoryImage = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;

  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw AppError.validation('An image file is required');
  }

  const mimeType = file.mimetype.split(';')[0]?.trim().toLowerCase() ?? '';
  const stored = await imageStorage.saveCategoryImage({
    buffer: file.buffer,
    mimeType,
  });

  sendSuccess(
    res,
    { url: absoluteUploadUrl(req, stored.url) },
    { statusCode: 201, message: 'Category image uploaded' },
  );
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

const listFeaturedCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await categoryService.listFeatured();

  sendSuccess(res, categories, { message: 'Featured categories fetched' });
});

const setCategoryFeatured = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as SetCategoryFeaturedInput;
  const category = await categoryService.setFeatured(routeParam(req.params.id), body.isFeatured);

  sendSuccess(res, category, { message: 'Category featured status updated' });
});

const updateFeaturedOrder = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateFeaturedOrderInput;
  const categories = await categoryService.updateFeaturedOrder(body.categoryIds);

  sendSuccess(res, categories, { message: 'Featured category order updated' });
});

export const categoryController = {
  listCategories,
  treeCategories,
  listFeaturedCategories,
  getCategory,
  getCategoryBySlug,
  uploadCategoryImage,
  createCategory,
  updateCategory,
  deleteCategory,
  setCategoryFeatured,
  updateFeaturedOrder,
};
