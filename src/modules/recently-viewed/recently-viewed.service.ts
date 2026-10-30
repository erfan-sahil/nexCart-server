import { RecentlyViewedItemModel } from '../../models/recentlyViewedItem.model';
import { productService } from '../../services/product.service';
import { MAX_RECENTLY_VIEWED_ITEMS } from './constants';

const list = async (userId: string) => {
  const rows = await RecentlyViewedItemModel.find({ userId })
    .sort({ viewedAt: -1 })
    .select('productId')
    .lean();

  const ids = rows.map((row) => String(row.productId));
  const items = await productService.listListedByIds(ids);

  return { items };
};

const trimToLimit = async (userId: string) => {
  const excess = await RecentlyViewedItemModel.find({ userId })
    .sort({ viewedAt: -1 })
    .skip(MAX_RECENTLY_VIEWED_ITEMS)
    .select('_id')
    .lean();

  if (excess.length === 0) {
    return;
  }

  await RecentlyViewedItemModel.deleteMany({
    _id: { $in: excess.map((row) => row._id) },
  });
};

const record = async (userId: string, productId: string) => {
  const product = await productService.getById(productId);
  const viewedAt = new Date();

  await RecentlyViewedItemModel.findOneAndUpdate(
    { userId, productId },
    { $set: { viewedAt } },
    { upsert: true, setDefaultsOnInsert: true },
  );

  await trimToLimit(userId);

  return { product };
};

const remove = async (userId: string, productId: string) => {
  await RecentlyViewedItemModel.deleteOne({ userId, productId });
};

const clear = async (userId: string) => {
  await RecentlyViewedItemModel.deleteMany({ userId });
};

export const recentlyViewedService = {
  list,
  record,
  remove,
  clear,
};
