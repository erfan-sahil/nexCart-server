import { Router } from 'express';
import { Permission } from '../constants/permissions';
import { productController } from '../controllers/product.controller';
import { authenticateOptional } from '../middleware/authenticate';
import { requirePermissions } from '../middleware/authorize';
import { uploadProductImages } from '../middleware/uploadProductImages';
import { validate } from '../middleware/validate';
import {
  createProductSchema,
  featureProductSchema,
  listManageProductsQuerySchema,
  listMineProductsQuerySchema,
  listPublicProductsQuerySchema,
  productIdParamsSchema,
  productImageParamsSchema,
  productSlugParamsSchema,
  thumbnailSchema,
  updateProductSchema,
} from '../validators/product.validator';

export const productRouter = Router();

productRouter.get(
  '/mine',
  ...requirePermissions(Permission.vendorProducts),
  validate({ query: listMineProductsQuerySchema }),
  productController.listMine,
);

productRouter.get(
  '/manage',
  ...requirePermissions(Permission.adminProductModeration),
  validate({ query: listManageProductsQuerySchema }),
  productController.listForModeration,
);

productRouter.get(
  '/slug/:slug',
  authenticateOptional,
  validate({ params: productSlugParamsSchema }),
  productController.getProductBySlug,
);

productRouter.get(
  '/',
  validate({ query: listPublicProductsQuerySchema }),
  productController.listProducts,
);

productRouter.post(
  '/',
  ...requirePermissions(Permission.vendorProducts),
  validate({ body: createProductSchema }),
  productController.createProduct,
);

productRouter.get(
  '/:id',
  authenticateOptional,
  validate({ params: productIdParamsSchema }),
  productController.getProduct,
);

productRouter.patch(
  '/:id',
  ...requirePermissions(Permission.vendorProducts),
  validate({ params: productIdParamsSchema, body: updateProductSchema }),
  productController.updateProduct,
);

productRouter.delete(
  '/:id',
  ...requirePermissions(Permission.vendorProducts),
  validate({ params: productIdParamsSchema }),
  productController.deleteProduct,
);

productRouter.post(
  '/:id/images',
  ...requirePermissions(Permission.vendorProducts),
  validate({ params: productIdParamsSchema }),
  uploadProductImages,
  productController.addImages,
);

productRouter.delete(
  '/:id/images/:imageId',
  ...requirePermissions(Permission.vendorProducts),
  validate({ params: productImageParamsSchema }),
  productController.removeImage,
);

productRouter.patch(
  '/:id/thumbnail',
  ...requirePermissions(Permission.vendorProducts),
  validate({ params: productIdParamsSchema, body: thumbnailSchema }),
  productController.setThumbnail,
);

productRouter.patch(
  '/:id/featured',
  ...requirePermissions(Permission.adminProductModeration),
  validate({ params: productIdParamsSchema, body: featureProductSchema }),
  productController.featureProduct,
);
