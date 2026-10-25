import type { FilterQuery, UpdateQuery } from 'mongoose';
import { AuthSessionModel } from '../models/authSession.model';
import { StoreModel } from '../models/store.model';
import { UserModel, type User } from '../models/user.model';
import { VendorApplicationModel } from '../models/vendorApplication.model';
import { AppError } from '../utils/AppError';
import { duplicateKeyFields, isDuplicateKeyError } from '../utils/mongoError';
import { escapeRegex } from '../utils/slugify';
import type { ListUsersQuery, UpdateUserInput } from '../validators/user.validator';
import { toUserDto } from './auth.service';
import { storeService } from './store.service';

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

const mapAccountDuplicate = (error: unknown) => {
  if (!isDuplicateKeyError(error)) {
    return error;
  }

  const fields = duplicateKeyFields(error);

  if (fields.includes('email')) {
    return AppError.conflict('An account with this email already exists');
  }

  if (fields.includes('phone')) {
    return AppError.conflict('An account with this phone number already exists');
  }

  return AppError.conflict('An account with this value already exists');
};

const countOtherActiveAdmins = (userId: User['_id']) =>
  UserModel.countDocuments({
    _id: { $ne: userId },
    role: 'admin',
    status: 'active',
  });

const assertAnotherActiveAdminRemains = async (user: User) => {
  if (user.role !== 'admin' || user.status !== 'active') {
    return;
  }

  const others = await countOtherActiveAdmins(user._id);

  if (others === 0) {
    throw AppError.conflict('At least one active admin must remain');
  }
};

const assertNoOwnedStore = async (userId: User['_id'], message: string) => {
  const store = await StoreModel.exists({ userId });

  if (store) {
    throw AppError.conflict(message);
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

const buildUpdate = (input: UpdateUserInput): UpdateQuery<User> => {
  const $set: NonNullable<UpdateQuery<User>['$set']> = {};
  const $unset: NonNullable<UpdateQuery<User>['$unset']> = {};

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

  return update;
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
      const regex = { $regex: escapeRegex(query.search), $options: 'i' };

      filter.$or = [{ email: regex }, { firstName: regex }, { lastName: regex }, { phone: regex }];
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
    const roleChanging = input.role !== undefined && input.role !== user.role;
    const statusChanging = input.status !== undefined && input.status !== user.status;

    if (actorId === userId && roleChanging) {
      throw AppError.forbidden('You cannot change your own role');
    }

    if (actorId === userId && statusChanging) {
      throw AppError.forbidden('You cannot change your own status');
    }

    if (user.role === 'vendor' && roleChanging && input.role !== 'vendor') {
      await assertNoOwnedStore(
        user._id,
        'Remove the store owned by this user before changing the role',
      );
    }

    const staysActiveAdmin = nextRole === 'admin' && nextStatus === 'active';

    if (!staysActiveAdmin) {
      await assertAnotherActiveAdminRemains(user);
    }

    try {
      const updated = await UserModel.findByIdAndUpdate(user._id, buildUpdate(input), {
        new: true,
        runValidators: true,
      });

      if (!updated) {
        throw AppError.notFound('User not found');
      }

      if (previousStatus !== 'suspended' && updated.status === 'suspended') {
        await revokeSessions(updated._id);
      }

      if (updated.role === 'vendor') {
        await storeService.setSuspendedForOwner(
          String(updated._id),
          updated.status === 'suspended',
        );
      }

      return toUserDto(updated);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw mapAccountDuplicate(error);
    }
  },

  async remove(actorId: string, userId: string) {
    if (actorId === userId) {
      throw AppError.forbidden('You cannot delete your own account');
    }

    const user = await findUser(userId);
    await assertAnotherActiveAdminRemains(user);
    await assertNoOwnedStore(
      user._id,
      'Remove the store owned by this user before deleting the account',
    );

    const id = String(user._id);

    await AuthSessionModel.deleteMany({ userId: user._id });
    await VendorApplicationModel.deleteMany({ userId: user._id });
    await user.deleteOne();

    return { id };
  },
};
