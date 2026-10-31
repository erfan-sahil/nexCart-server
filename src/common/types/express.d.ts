import type { UserDto } from '../../modules/auth/types';
import type { Logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log: Logger;
      auth?: {
        user: UserDto;
        sessionId: string;
      };
    }
  }
}

export {};
