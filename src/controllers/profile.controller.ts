import type { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/sendResponse';
import type { UpdateProfileInput } from '../validators/profile.validator';

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
