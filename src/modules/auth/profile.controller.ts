import type { Request, Response } from 'express';
import { authService } from './auth.service';
import { AppError } from '../../common/errors/AppError';
import { asyncHandler } from '../../common/http/asyncHandler';
import { sendSuccess } from '../../common/http/sendResponse';
import type { UpdateProfileInput } from './profile.validator';

const updateMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  const body = req.body as UpdateProfileInput;
  const user = await authService.updateProfile(req.auth.user.id, body);

  sendSuccess(res, { user, sessionId: req.auth.sessionId }, { message: 'Profile updated' });
});

export const profileController = {
  updateMe,
};
