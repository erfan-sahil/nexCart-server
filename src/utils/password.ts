import bcrypt from 'bcryptjs';
import { env } from '../config/env';

const DUMMY_PASSWORD_HASH = '$2b$12$F92Aeh4sOV2p2nqjNN4jVuy1yJtgvOhEKU1ZBbkjJTjXZ/2dJLXMi';

export const hashPassword = (password: string) => bcrypt.hash(password, env.BCRYPT_ROUNDS);

export const verifyPassword = async (password: string, passwordHash?: string) => {
  const matches = await bcrypt.compare(password, passwordHash ?? DUMMY_PASSWORD_HASH);
  return Boolean(passwordHash) && matches;
};
