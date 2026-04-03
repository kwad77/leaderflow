import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema, target: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const errors = result.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }));
      return res.status(400).json({ error: 'Validation failed', errors });
    }
    req[target] = result.data;
    next();
  };
}
