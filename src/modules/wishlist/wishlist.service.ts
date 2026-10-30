import { WishlistItemModel } from '../../models/wishlistItem.model';
import { productService } from '../../services/product.service';
import { AppError } from '../../utils/AppError';
import { isDuplicateKeyError } from '../../utils/mongoError';
import { MAX_WISHLIST_ITEMS } from './constants';

const list = async (userId: string) => {
  const rows = await WishlistItemModel.find({ userId })
    .sort({ createdAt: -1 })
    .select('productId')
    .lean();

  const ids = rows.map((row) => String(row.productId));
  const items = await productService.listListedByIds(ids);

  return { items };
};

const add = async (userId: string, productId: string) => {
  const product = await productService.getById(productId);
  const existing = await WishlistItemModel.exists({ userId, productId });

  if (existing) {
    return { product, created: false };
  }

  const count = await WishlistItemModel.countDocuments({ userId });

  if (count >= MAX_WISHLIST_ITEMS) {
    throw AppError.conflict(`Wishlist can hold up to ${MAX_WISHLIST_ITEMS} products`);
  }

  try {
    await WishlistItemModel.create({ userId, productId });
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    return { product, created: false };
  }

  return { product, created: true };
};

const remove = async (userId: string, productId: string) => {
  await WishlistItemModel.deleteOne({ userId, productId });
};

const clear = async (userId: string) => {
  await WishlistItemModel.deleteMany({ userId });
};

export const wishlistService = {
  list,
  add,
  remove,
  clear,
};
