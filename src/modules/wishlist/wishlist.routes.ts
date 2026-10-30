import { Router } from 'express';
import { requirePermissions } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { wishlistController, wishlistPermissions } from './wishlist.controller';
import { addWishlistSchema, wishlistProductParamsSchema } from './wishlist.validator';

export const wishlistRouter = Router();

wishlistRouter.get('/', ...requirePermissions(wishlistPermissions.list), wishlistController.list);

wishlistRouter.post(
  '/',
  ...requirePermissions(wishlistPermissions.add),
  validate({ body: addWishlistSchema }),
  wishlistController.add,
);

wishlistRouter.delete(
  '/',
  ...requirePermissions(wishlistPermissions.clear),
  wishlistController.clear,
);

wishlistRouter.delete(
  '/:productId',
  ...requirePermissions(wishlistPermissions.remove),
  validate({ params: wishlistProductParamsSchema }),
  wishlistController.remove,
);
