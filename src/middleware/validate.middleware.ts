import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, ZodIssue } from 'zod';

/**
 * Flattens Zod issues into named field errors.
 *
 * A failing `z.union` (e.g. the draft-or-publish attraction schema) reports a
 * single `invalid_union` issue whose own path is EMPTY, which surfaced to
 * admins as an unnamed ": Invalid input" with nothing to act on (ATN row 81).
 * Unwrapping the union's sub-errors restores the real field paths.
 */
export const flattenZodIssues = (issues: ZodIssue[]): Array<{ field: string; message: string }> =>
  issues.flatMap((issue) => {
    if (issue.code === 'invalid_union') {
      const nested = issue.unionErrors.flatMap((unionError) => flattenZodIssues(unionError.errors));
      const named = nested.filter((entry) => entry.field);
      if (named.length > 0) {
        // De-duplicate: the same field usually fails in several union branches.
        const seen = new Set<string>();
        return named.filter((entry) => {
          const key = `${entry.field}: ${entry.message}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    }
    return [{ field: issue.path.join('.'), message: issue.message }];
  });

export const validate = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync(req.body);
      req.body = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = flattenZodIssues(error.errors);

        res.status(400).json({
          success: false,
          error: 'Validation failed',
          errors,
        });
        return;
      }
      next(error);
    }
  };
};

export const validateQuery = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync(req.query);
      req.query = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = flattenZodIssues(error.errors);

        res.status(400).json({
          success: false,
          error: 'Query validation failed',
          errors,
        });
        return;
      }
      next(error);
    }
  };
};

export const validateParams = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync(req.params);
      req.params = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = flattenZodIssues(error.errors);

        res.status(400).json({
          success: false,
          error: 'Parameter validation failed',
          errors,
        });
        return;
      }
      next(error);
    }
  };
};
