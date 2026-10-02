import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { authLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { loginSchema, registerSchema, sessionIdParamsSchema } from '../validators/auth.validator';

export const authRouter = Router();

authRouter.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  authController.register,
);

authRouter.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);

authRouter.post('/refresh', authLimiter, authController.refresh);

authRouter.post('/logout', authController.logout);

authRouter.post('/logout-all', authenticate, authController.logoutAll);

authRouter.get('/sessions', authenticate, authController.listSessions);

authRouter.delete(
  '/sessions/:sessionId',
  authenticate,
  validate({ params: sessionIdParamsSchema }),
  authController.revokeSession,
);

authRouter.get('/me', authenticate, authController.me);
