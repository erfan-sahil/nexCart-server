import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

type RequestSchema = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

export const validate =
  (schema: RequestSchema) => async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }

      if (schema.query) {
        req.query = (await schema.query.parseAsync(req.query)) as typeof req.query;
      }

      if (schema.params) {
        req.params = (await schema.params.parseAsync(req.params)) as typeof req.params;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
