import type { Request, Response } from 'express';
import { productService } from '../services/product.service';
import type { ProductViewer } from '../types/product';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/sendResponse';
import type {
  ApproveProductInput,
  CreateProductInput,
  FeatureProductInput,
  ListManageProductsQuery,
  ListMineProductsQuery,
  ListPublicProductsQuery,
  RejectProductInput,
  ThumbnailInput,
  UpdateProductInput,
} from '../validators/product.validator';

const routeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

const actorId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const viewerOf = (req: Request): ProductViewer | undefined => {
  if (!req.auth) {
    return undefined;
  }

  return {
    id: req.auth.user.id,
    role: req.auth.user.role,
  };
};

const imageUploads = (req: Request) => {
  if (!Array.isArray(req.files)) {
    return [];
  }

  return req.files.flatMap((file) => {
    const mimeType = file.mimetype.split(';')[0]?.trim().toLowerCase() ?? '';

    if (!Buffer.isBuffer(file.buffer) || mimeType.length === 0) {
      return [];
    }

    return [{ buffer: file.buffer, mimeType }];
  });
};

const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListPublicProductsQuery;
  const result = await productService.listPublic(query);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const listMine = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListMineProductsQuery;
  const result = await productService.listMine(actorId(req), query);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const listForModeration = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListManageProductsQuery;
  const result = await productService.listForModeration(query);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const getProductBySlug = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.getBySlug(routeParam(req.params.slug), viewerOf(req));

  sendSuccess(res, product, { message: 'Product fetched' });
});

const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.getById(routeParam(req.params.id), viewerOf(req));

  sendSuccess(res, product, { message: 'Product fetched' });
});

const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.create(
    actorId(req),
    req.body as CreateProductInput,
    imageUploads(req),
  );

  sendCreated(res, product, 'Product created');
});

const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.update(
    actorId(req),
    routeParam(req.params.id),
    req.body as UpdateProductInput,
  );

  sendSuccess(res, product, { message: 'Product updated' });
});

const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const result = await productService.remove(actorId(req), routeParam(req.params.id));

  sendSuccess(res, result, { message: 'Product deleted' });
});

const addImages = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.addImages(
    actorId(req),
    routeParam(req.params.id),
    imageUploads(req),
  );

  sendSuccess(res, product, { message: 'Product images added' });
});

const removeImage = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.removeImage(
    actorId(req),
    routeParam(req.params.id),
    routeParam(req.params.imageId),
  );

  sendSuccess(res, product, { message: 'Product image removed' });
});

const setThumbnail = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as ThumbnailInput;
  const product = await productService.setThumbnail(
    actorId(req),
    routeParam(req.params.id),
    body.imageId,
  );

  sendSuccess(res, product, { message: 'Product thumbnail updated' });
});

const submitProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.submit(actorId(req), routeParam(req.params.id));

  sendSuccess(res, product, { message: 'Product submitted for approval' });
});

const approveProduct = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as ApproveProductInput;
  const product = await productService.approve(routeParam(req.params.id), body.note);

  sendSuccess(res, product, { message: 'Product approved' });
});

const rejectProduct = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as RejectProductInput;
  const product = await productService.reject(routeParam(req.params.id), body.note);

  sendSuccess(res, product, { message: 'Product rejected' });
});

const featureProduct = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as FeatureProductInput;
  const product = await productService.setFeatured(routeParam(req.params.id), body.isFeatured);

  sendSuccess(res, product, { message: 'Product featuring updated' });
});

export const productController = {
  listProducts,
  listMine,
  listForModeration,
  getProductBySlug,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  addImages,
  removeImage,
  setThumbnail,
  submitProduct,
  approveProduct,
  rejectProduct,
  featureProduct,
};
