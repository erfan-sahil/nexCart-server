import type { Logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log: Logger;
    }
  }
}

export {};
