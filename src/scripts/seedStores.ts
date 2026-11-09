import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../common/utils/logger';
import { StoreModel } from '../modules/stores/store.model';
import { assertSeedingAllowed, describeMongoTarget, ensureUser } from './seedUtils';
import { ADMIN_SEED, DEMO_PASSWORD, storeSeed, type StoreSeed } from './siteSeed';

const DAY_MS = 24 * 60 * 60 * 1000;

async function upsertStore(item: StoreSeed) {
  const user = await ensureUser({
    email: item.email,
    firstName: item.firstName,
    lastName: item.lastName,
    phone: item.phone,
    role: 'vendor',
  });
  const fields = {
    name: item.name,
    description: item.description,
    logo: item.logo,
    banner: item.banner,
    contact: { email: item.email, phone: item.phone },
    address: {
      line1: `${10 + (item.joinedDaysAgo % 80)} Market Road`,
      city: item.city,
      state: item.city,
      postalCode: '1200',
      country: 'Bangladesh',
    },
    returnPolicy: item.returnPolicy,
    shippingPolicy: item.shippingPolicy,
    isActive: true,
    suspendedAt: null,
  };
  const store = await StoreModel.findOne({ slug: item.slug });

  if (store) {
    store.set(fields);
    await store.save();
    return store;
  }

  return StoreModel.create({
    ...fields,
    userId: user._id,
    slug: item.slug,
    joinedAt: new Date(Date.now() - item.joinedDaysAgo * DAY_MS),
  });
}

async function seedStores() {
  assertSeedingAllowed();
  await connectDatabase();
  logger.info('Seeding stores', { target: describeMongoTarget() });

  await ensureUser({ ...ADMIN_SEED, role: 'admin' });

  for (const item of storeSeed) {
    await upsertStore(item);
  }

  logger.info('Store seed complete', {
    stores: storeSeed.length,
    adminEmail: ADMIN_SEED.email,
    demoPassword: DEMO_PASSWORD,
  });
  await disconnectDatabase();
}

seedStores().catch(async (error: unknown) => {
  logger.error('Store seed failed', { err: error });
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
