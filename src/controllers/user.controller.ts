import type { Request, Response } from 'express';
import { userService } from '../services/user.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendPaginated, sendSuccess } from '../utils/sendResponse';
import type { ListUsersQuery, UpdateUserInput } from '../validators/user.validator';

const actorId = (req: Request) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }

  return req.auth.user.id;
};

const queryId = (req: Request) => {
  const id = (req.query as { id?: string }).id;
  return id ?? '';
};

const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListUsersQuery;

  if (query.id) {
    const user = await userService.getById(query.id);
    sendSuccess(res, { user }, { message: 'User fetched' });
    return;
  }

  const result = await userService.list(query);

  sendPaginated(
    res,
    result.items,
    {
      page: result.page,
      limit: result.limit,
      total: result.total,
    },
    'Users fetched',
  );
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.update(actorId(req), queryId(req), req.body as UpdateUserInput);

  sendSuccess(res, { user }, { message: 'User updated' });
});

const remove = asyncHandler(async (req: Request, res: Response) => {
  const result = await userService.remove(actorId(req), queryId(req));

  sendSuccess(res, result, { message: 'User deleted' });
});

export const userController = {
  list,
  update,
  remove,
};
