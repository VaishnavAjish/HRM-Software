import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError, ZodSchema } from 'zod';
import { ValidationError } from './error.middleware';

export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        return next(new ValidationError('Validation failed', formattedErrors));
      }
      next(error);
    }
  };
};

export const validateBody = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        return next(new ValidationError('Validation failed', formattedErrors));
      }
      next(error);
    }
  };
};

export const validateQuery = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.query = await schema.parseAsync(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        return next(new ValidationError('Query validation failed', formattedErrors));
      }
      next(error);
    }
  };
};

export const validateParams = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.params = await schema.parseAsync(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        return next(new ValidationError('Params validation failed', formattedErrors));
      }
      next(error);
    }
  };
};

export const validateAll = (
  bodySchema?: ZodSchema,
  querySchema?: ZodSchema,
  paramsSchema?: ZodSchema
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (bodySchema) {
        req.body = await bodySchema.parseAsync(req.body);
      }
      if (querySchema) {
        req.query = await querySchema.parseAsync(req.query);
      }
      if (paramsSchema) {
        req.params = await paramsSchema.parseAsync(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        return next(new ValidationError('Validation failed', formattedErrors));
      }
      next(error);
    }
  };
};

export const sanitizeBody = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    fields.forEach((field) => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        req.body[field] = req.body[field].trim();
      }
    });
    next();
  };
};

export const transformBody = (transformers: Record<string, (value: unknown) => unknown>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Object.entries(transformers).forEach(([field, transformer]) => {
      if (req.body[field] !== undefined) {
        try {
          req.body[field] = transformer(req.body[field]);
        } catch {
          // Ignore transformation errors, let validation handle it
        }
      }
    });
    next();
  };
};

export const validateFileUpload = (
  allowedMimeTypes: string[],
  maxSize: number = 5 * 1024 * 1024
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.file && !req.files) {
      return next();
    }

    const files = req.files ? Object.values(req.files).flat() : [req.file].filter(Boolean);

    for (const file of files) {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return next(
          new ValidationError(
            `File type ${file.mimetype} not allowed. Allowed: ${allowedMimeTypes.join(', ')}`
          )
        );
      }

      if (file.size > maxSize) {
        return next(
          new ValidationError(
            `File size ${file.size} exceeds maximum allowed size ${maxSize}`
          )
        );
      }
    }

    next();
  };
};