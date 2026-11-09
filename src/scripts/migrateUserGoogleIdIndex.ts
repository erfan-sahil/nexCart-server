import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../common/utils/logger';
import { UserModel } from '../modules/users/user.model';

const INDEX_NAME = 'googleId_1';

/**
 * Older databases hold `googleId: null` on local accounts plus a unique sparse index, which only
 * allows one such account. This unsets the nulls and rebuilds the index as a partial index.
 */
async function migrateUserGoogleIdIndex() {
  await connectDatabase();

  const indexes = await UserModel.collection.indexes();
  const current = indexes.find((index) => index.name === INDEX_NAME);

  if (current && !current.partialFilterExpression) {
    await UserModel.collection.dropIndex(INDEX_NAME);
  }

  const cleared = await UserModel.collection.updateMany(
    { googleId: null },
    { $unset: { googleId: '' } },
  );

  await UserModel.createIndexes();

  logger.info('User googleId index migrated', { cleared: cleared.modifiedCount });
  await disconnectDatabase();
}

migrateUserGoogleIdIndex().catch(async (error: unknown) => {
  logger.error('User googleId index migration failed', { err: error });
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
