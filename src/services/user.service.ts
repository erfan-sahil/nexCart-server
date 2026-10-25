import type { FilterQuery, UpdateQuery } from 'mongoose';
import { AuthSessionModel } from '../models/authSession.model';
import { StoreModel } from '../models/store.model';
import { UserModel, type User } from '../models/user.model';
import { VendorApplicationModel } from '../models/vendorApplication.model';
import { AppError } from '../utils/AppError';
import { duplicateKeyFields } from '../utils/mongoError';
import { escapeRegex } from '../utils/slugify';
import type { ListUsersQuery, UpdateUserInput } from '../validators/user.validator';
import { toUserDto } from './auth.service';

const SORTS = {
  createdAt: { createdAt: 1 },
  '-createdAt': { createdAt: -1 },
  name: { firstName: 1, lastName: 1 },
  '-name': { firstName: -1, lastName: -1 },
  email: { email: 1 },
  '-email': { email: -1 },
  lastLoginAt: { lastLoginAt: 1 },
  '-lastLoginAt': { lastLoginAt: -1 },
} as const;

const accountConflict = (error: unknown): Error => {
  const fields = duplicateKeyFields(error);

  if (fields.includes('email')) {
    return AppError.conflict('An account with this email already exists');
  }

  if (fields.includes('phone')) {
    return AppError.conflict('An account with this phone number already exists');
  }

  if (error instanceof Error) {
    return error;
  }

  return AppError.internal();
};

const countOtherActiveAdmins = (userId: User['_id']) =>
  UserModel.countDocuments({
    _id: { $ne: userId },
    role: 'admin',
    status: 'active',
  });

const assertAnotherActiveAdmin = async (user: User) => {
  if (user.role !== 'admin' || user.status !== 'active') {
    return;
  }

  const others = await countOtherActiveAdmins(user._id);

  if (others === 0) {
    throw AppError.conflict('At least one active admin must remain');
  }
};

const revokeSessions = (userId: User['_id']) =>
  AuthSessionModel.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });

const findUser = async (userId: string) => {
  const user = await UserModel.findById(userId);

  if (!user) {
    throw AppError.notFound('User not found');
  }

  return user;
};

export const userService = {
  async list(query: ListUsersQuery) {
    const filter: FilterQuery<User> = {};

    if (query.role) {
      filter.role = query.role;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.search) {
      const pattern = escapeRegex(query.search);
      const regex = { $regex: pattern, $options: 'i' };

      filter.$or = [
        { email: regex },
        { firstName: regex },
        { lastName: regex },
        { phone: regex },
        {
          $expr: {
            $regexMatch: {
              input: { $concat: ['$firstName', ' ', '$lastName'] },
              regex: pattern,
              options: 'i',
            },
          },
        },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      UserModel.find(filter).sort(SORTS[query.sort]).skip(skip).limit(query.limit).lean(),
      UserModel.countDocuments(filter),
    ]);

    return {
      items: items.map((item) => toUserDto(item)),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async getById(userId: string) {
    const user = await findUser(userId);
    return toUserDto(user);
  },

  async update(actorId: string, userId: string, input: UpdateUserInput) {
    const user = await findUser(userId);
    const nextRole = input.role ?? user.role;
    const nextStatus = input.status ?? user.status;
    const previousStatus = user.status;

    if (actorId === userId && input.role !== undefined && input.role !== user.role) {
      throw AppError.forbidden('You cannot change your own role');
    }

    if (actorId === userId && input.status !== undefined && input.status !== user.status) {
      throw AppError.forbidden('You cannot change your own status');
    }

    const staysActiveAdmin = nextRole === 'admin' && nextStatus === 'active';

    if (!staysActiveAdmin) {
      await assertAnotherActiveAdmin(user);
    }

    const $set: UpdateQuery<User>['$set'] = {};
    const $unset: UpdateQuery<User>['$unset'] = {};

    if (input.email !== undefined) {
      $set.email = input.email;
    }

    if (input.firstName !== undefined) {
      $set.firstName = input.firstName;
    }

    if (input.lastName !== undefined) {
      $set.lastName = input.lastName;
    }

    if (input.phone) {
      $set.phone = input.phone;
    } else if (input.phone === '') {
      $unset.phone = 1;
    }

    if (input.role !== undefined) {
      $set.role = input.role;
    }

    if (input.status !== undefined) {
      $set.status = input.status;
    }

    const update: UpdateQuery<User> = {};

    if (Object.keys($set).length > 0) {
      update.$set = $set;
    }

    if (Object.keys($unset).length > 0) {
      update.$unset = $unset;
    }

    try {
      const updated = await UserModel.findByIdAndUpdate(user._id, update, {
        new: true,
        runValidators: true,
      });

      if (!updated) {
        throw AppError.notFound('User not found');
      }

      if (previousStatus !== 'suspended' && updated.status === 'suspended') {
        await revokeSessions(updated._id);
      }

      return toUserDto(updated);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw accountConflict(error);
    }
  },

  async remove(actorId: string, userId: string) {
    if (actorId === userId) {
      throw AppError.forbidden('You cannot delete your own account');
    }

    const user = await findUser(userId);
    await assertAnotherActiveAdmin(user);

    const store = await StoreModel.exists({ userId: user._id });

    if (store) {
      throw AppError.conflict('Remove the store owned by this user before deleting the account');
    }

    const id = String(user._id);
    await user.deleteOne();
    await Promise.all([
      AuthSessionModel.deleteMany({ userId: user._id }),
      VendorApplicationModel.deleteMany({ userId: user._id }),
    ]);

    return { id };
  },
};
