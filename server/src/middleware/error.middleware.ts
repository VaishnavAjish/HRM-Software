import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { config } from '../config/environment';

export interface ApiError {
  success: false;
  message: string;
  errors?: Array<{ field: string; message: string; code: string }>;
  meta?: Record<string, unknown>;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: Array<{ field: string; message: string; code: string }>;
  public readonly meta?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    errors?: Array<{ field: string; message: string; code: string }>,
    meta?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;
    this.meta = meta;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string = 'Validation failed',
    errors?: Array<{ field: string; message: string; code: string }>
  ) {
    super(message, 400, true, errors);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, true);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, true);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, true);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict') {
    super(message, 409, true);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request') {
    super(message, 400, true);
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, true);
    Object.setPrototypeOf(this, TooManyRequestsError.prototype);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, false);
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service unavailable') {
    super(message, 503, true);
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

const handleZodError = (error: ZodError): AppError => {
  const errors = error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));
  return new ValidationError('Validation failed', errors);
};

const handleMongooseValidationError = (error: mongoose.Error.ValidationError): AppError => {
  const errors = Object.values(error.errors).map((err) => ({
    field: err.path,
    message: err.message,
    code: 'VALIDATION_ERROR',
  }));
  return new ValidationError('Validation failed', errors);
};

const handleMongooseDuplicateError = (error: mongoose.mongo.MongoServerError): AppError => {
  const field = Object.keys(error.keyValue)[0];
  const value = error.keyValue[field];
  return new ConflictError(`${field} '${value}' already exists`);
};

const handleMongooseCastError = (error: mongoose.Error.CastError): AppError => {
  return new BadRequestError(`Invalid ${error.path}: ${error.value}`);
};

const handleJwtError = (): AppError => {
  return new UnauthorizedError('Invalid token. Please log in again.');
};

const handleTokenExpiredError = (): AppError => {
  return new UnauthorizedError('Token expired. Please log in again.');
};

const sendErrorDev = (err: AppError, res: Response): void => {
  res.status(err.statusCode).json({
    success: false,
    error: err,
    message: err.message,
    stack: err.stack,
    errors: err.errors,
    meta: err.meta,
  });
};

const sendErrorProd = (err: AppError, res: Response): void => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
      meta: err.meta,
    });
  } else {
    console.error('ERROR 💥:', err);
    res.status(500).json({
      success: false,
      message: 'Something went wrong!',
    });
  }
};

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  err.statusCode = (err as AppError).statusCode || 500;
  err.isOperational = (err as AppError).isOperational || false;

  if (config.nodeEnv === 'development') {
    sendErrorDev(err as AppError, res);
  } else {
    let error = { ...err } as AppError;
    error.message = err.message;

    if (err instanceof ZodError) {
      error = handleZodError(err);
    } else if (err instanceof mongoose.Error.ValidationError) {
      error = handleMongooseValidationError(err);
    } else if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
      error = handleMongooseDuplicateError(err);
    } else if (err instanceof mongoose.Error.CastError) {
      error = handleMongooseCastError(err);
    } else if (err instanceof JsonWebTokenError) {
      error = handleJwtError();
    } else if (err instanceof TokenExpiredError) {
      error = handleTokenExpiredError();
    }

    sendErrorProd(error, res);
  }
};

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const createErrorResponse = (
  message: string,
  statusCode: number = 500,
  errors?: Array<{ field: string; message: string; code: string }>,
  meta?: Record<string, unknown>
): ApiError => ({
  success: false,
  message,
  errors,
  meta,
});

export const handleControllerError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return handleZodError(error);
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return handleMongooseValidationError(error);
  }

  if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
    return handleMongooseDuplicateError(error);
  }

  if (error instanceof mongoose.Error.CastError) {
    return handleMongooseCastError(error);
  }

  if (error instanceof JsonWebTokenError) {
    return handleJwtError();
  }

  if (error instanceof TokenExpiredError) {
    return handleTokenExpiredError();
  }

  console.error('Unhandled error:', error);
  return new InternalServerError('An unexpected error occurred');
};