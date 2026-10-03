import path from 'node:path';
import { env } from './env';

export const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);
