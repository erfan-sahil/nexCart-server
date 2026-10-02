import { UserModel } from '../models/user.model';
import type { UserRole } from '../types/auth';
import { AppError } from '../utils/AppError';
import { toUserDto } from './auth.service';

export const userService = {
  async updateRole(actorId: string, userId: string, role: UserRole) {
    if (actorId === userId) {
      throw AppError.forbidden('You cannot change your own role');
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      throw AppError.notFound('User not found');
    }

    user.role = role;
    await user.save();

    return toUserDto(user);
  },
};
