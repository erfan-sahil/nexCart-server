import { z } from 'zod';

import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../common/utils/logger';
import { hashPassword } from '../common/utils/password';
import { UserModel } from '../modules/users/user.model';
import { describeMongoTarget } from './seedUtils';

/** Credentials come from the shell so a real admin password never lands in the repository. */
const adminInput = z
  .object({
    SEED_ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
    SEED_ADMIN_PASSWORD: z.string().min(8).max(72),
    SEED_ADMIN_FIRST_NAME: z.string().trim().min(1).max(50).default('Admin'),
    SEED_ADMIN_LAST_NAME: z.string().trim().min(1).max(50).default('User'),
  })
  .parse(process.env);

async function seedAdmin() {
  await connectDatabase();
  logger.info('Seeding admin', { target: describeMongoTarget() });

  const email = adminInput.SEED_ADMIN_EMAIL;
  const passwordHash = await hashPassword(adminInput.SEED_ADMIN_PASSWORD);
  const existing = await UserModel.findOne({ email });

  if (existing) {
    existing.set({
      passwordHash,
      role: 'admin',
      status: 'active',
      emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockUntil: null,
    });
    await existing.save();
  } else {
    await UserModel.create({
      email,
      passwordHash,
      firstName: adminInput.SEED_ADMIN_FIRST_NAME,
      lastName: adminInput.SEED_ADMIN_LAST_NAME,
      role: 'admin',
      status: 'active',
      authProvider: 'local',
      emailVerifiedAt: new Date(),
    });
  }

  logger.info('Admin seed complete', { email, created: !existing });
  await disconnectDatabase();
}

seedAdmin().catch(async (error: unknown) => {
  logger.error('Admin seed failed', { err: error });
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
