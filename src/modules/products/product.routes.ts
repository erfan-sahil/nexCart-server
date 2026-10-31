import { Router } from 'express';
import { Permission } from '../../common/constants/permissions';
import { productController } from './product.controller';
import { variantController } from './variant.controller';
import { authenticateOptional } from '../../common/middleware/authenticate';
import { requirePermissions } from '../../common/middleware/authorize';
import { uploadProductImage, uploadProductImages } from './upload-product-images';
import { validate } from '../../common/middleware/validate';
import {
  approveProductSchema,
  createProductSchema,
  featureProductSchema,
  listManageProductsQuerySchema,
  listMineProductsQuerySchema,
  listPublicProductsQuerySchema,
  productIdParamsSchema,
  productImageParamsSchema,
  productSlugParamsSchema,
  rejectProductSchema,
  thumbnailSchema,
  updateProductSchema,
} from './product.validator';
import {
  createVariantSchema,
  listVariantsQuerySchema,
  updateVariantSchema,
  variantParamsSchema,
} from './variant.validator';

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
  '/image',
  ...requirePermissions(Permission.vendorProducts),
  uploadProductImage,
  productController.uploadProductImage,
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

productRouter.post(
  '/:id/submit',
  ...requirePermissions(Permission.vendorProducts),
  validate({ params: productIdParamsSchema }),
  productController.submitProduct,
);

productRouter.post(
  '/:id/approve',
  ...requirePermissions(Permission.adminProductModeration),
  validate({ params: productIdParamsSchema, body: approveProductSchema }),
  productController.approveProduct,
);

productRouter.post(
  '/:id/reject',
  ...requirePermissions(Permission.adminProductModeration),
  validate({ params: productIdParamsSchema, body: rejectProductSchema }),
  productController.rejectProduct,
);

productRouter.get(
  '/:id/variants',
  authenticateOptional,
  validate({ params: productIdParamsSchema, query: listVariantsQuerySchema }),
  variantController.list,
);

productRouter.post(
  '/:id/variants',
  ...requirePermissions(Permission.vendorVariants),
  validate({ params: productIdParamsSchema, body: createVariantSchema }),
  variantController.createVariant,
);

productRouter.get(
  '/:id/variants/:variantId',
  authenticateOptional,
  validate({ params: variantParamsSchema }),
  variantController.getVariant,
);

productRouter.patch(
  '/:id/variants/:variantId',
  ...requirePermissions(Permission.vendorVariants),
  validate({ params: variantParamsSchema, body: updateVariantSchema }),
  variantController.updateVariant,
);

productRouter.delete(
  '/:id/variants/:variantId',
  ...requirePermissions(Permission.vendorVariants),
  validate({ params: variantParamsSchema }),
  variantController.deleteVariant,
);

productRouter.patch(
  '/:id/featured',
  ...requirePermissions(Permission.adminProductModeration),
  validate({ params: productIdParamsSchema, body: featureProductSchema }),
  productController.featureProduct,
);
