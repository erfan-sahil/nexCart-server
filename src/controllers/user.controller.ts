import type { Request, Response } from 'express';
import { userService } from '../services/user.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendPaginated, sendSuccess } from '../utils/sendResponse';
import type {
  AccountStatusInput,
  ListUsersQuery,
  UpdateUserInput,
  UserIdQuery,
} from '../validators/user.validator';

const actorId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListUsersQuery;

  if (query.id) {
    const user = await userService.getById(query.id);
    sendSuccess(res, user, { message: 'User fetched' });
    return;
  }

  const result = await userService.list(query);

  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
});

const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.query as unknown as UserIdQuery;
  const user = await userService.update(actorId(req), id, req.body as UpdateUserInput);

  sendSuccess(res, user, { message: 'User updated' });
});

const setBuyerStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.query as unknown as UserIdQuery;
  const input = req.body as AccountStatusInput;
  const user = await userService.setStatus(actorId(req), id, 'customer', input);

  sendSuccess(res, user, {
    message: input.status === 'suspended' ? 'Buyer suspended' : 'Buyer activated',
  });
});

const setVendorStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.query as unknown as UserIdQuery;
  const input = req.body as AccountStatusInput;
  const user = await userService.setStatus(actorId(req), id, 'vendor', input);

  sendSuccess(res, user, {
    message: input.status === 'suspended' ? 'Vendor suspended' : 'Vendor activated',
  });
});

const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.query as unknown as UserIdQuery;
  const result = await userService.remove(actorId(req), id);

  sendSuccess(res, result, { message: 'User deleted' });
});

export const userController = {
  listUsers,
  updateUser,
  setBuyerStatus,
  setVendorStatus,
  deleteUser,
};
