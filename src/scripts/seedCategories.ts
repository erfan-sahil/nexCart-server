import { connectDatabase, disconnectDatabase } from '../config/database';
import { CategoryModel } from '../models/category.model';
import { categoryService } from '../services/category.service';
import { logger } from '../utils/logger';
import { categorySeed, type CategorySeed } from './categorySeed';

const USER_ROOT_ID = '6ac46f7a5ccfc05b47336e8b';
const USER_CHILD_ID = '6adf9293574ecfc4ca69c985';

async function restoreUserCategories() {
  const userRoot = await CategoryModel.findById(USER_ROOT_ID);
  const userChild = await CategoryModel.findById(USER_CHILD_ID);

  if (userRoot?.slug === 'electronics') {
    userRoot.name = 'Electronics 1791258490';
    userRoot.slug = 'electronics-1791258490';
    userRoot.description = '';
    await userRoot.save();
  }

  if (userChild?.slug === 'smartphones') {
    userChild.name = 'Mobile';
    userChild.slug = 'mobile-1791258490';
    userChild.description = '';
    await userChild.save();
  }
}

async function ensureNode(node: CategorySeed, parentId: string | null, sortOrder: number) {
  const existing = await CategoryModel.findOne({ slug: node.slug }).select('_id');

  if (!existing) {
    await categoryService.create({
      name: node.name,
      slug: node.slug,
      description: node.description,
      image: node.image,
      parentId,
      sortOrder,
      isActive: true,
    });
  }

  const saved = await CategoryModel.findOne({ slug: node.slug }).select('_id');

  if (!saved) {
    throw new Error(`Category ${node.slug} was not saved`);
  }

  const children = node.children ?? [];

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];

    if (!child) {
      continue;
    }

    await ensureNode(child, String(saved._id), child.popular ? 0 : index + 1);
  }
}

async function separateMockFromUserCategories() {
  const userRoot = await CategoryModel.findById(USER_ROOT_ID).select('_id');
  const userChild = await CategoryModel.findById(USER_CHILD_ID).select('_id');
  const mockElectronics = await CategoryModel.findOne({ slug: 'electronics' }).select('_id');
  const mockPhones = await CategoryModel.findOne({ slug: 'smartphones' }).select('_id');

  if (!userRoot || !userChild || !mockElectronics || !mockPhones) {
    return;
  }

  if (String(userRoot._id) === String(mockElectronics._id)) {
    return;
  }

  await CategoryModel.updateMany(
    { parentId: userRoot._id, _id: { $ne: userChild._id } },
    {
      $set: {
        parentId: mockElectronics._id,
        ancestors: [mockElectronics._id],
        level: 2,
      },
    },
  );

  await CategoryModel.updateMany(
    { parentId: userChild._id },
    {
      $set: {
        parentId: mockPhones._id,
        ancestors: [mockElectronics._id, mockPhones._id],
        level: 3,
      },
    },
  );
}

async function seedCategories() {
  await connectDatabase();
  await restoreUserCategories();

  for (let index = 0; index < categorySeed.length; index += 1) {
    const department = categorySeed[index];

    if (!department) {
      continue;
    }

    await ensureNode(department, null, index);
  }

  await separateMockFromUserCategories();

  const total = await CategoryModel.countDocuments();
  logger.info('Category seed complete', { total });
  await disconnectDatabase();
}

seedCategories().catch(async (error: unknown) => {
  logger.error('Category seed failed', { err: error });
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
