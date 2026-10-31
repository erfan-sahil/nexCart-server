import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

type RequestSchema = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

const assignRequestProperty = (req: Request, key: 'query' | 'params', value: unknown) => {
  Object.defineProperty(req, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
};

export const validate =
  (schema: RequestSchema) => async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }

      if (schema.query) {
        assignRequestProperty(req, 'query', await schema.query.parseAsync(req.query));
      }

      if (schema.params) {
        assignRequestProperty(req, 'params', await schema.params.parseAsync(req.params));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
