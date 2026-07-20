import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { redactUrlForLogs, safeDevelopmentError } from '../utils/safe-logging';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const error = new AppError('Route not found', 404);
  next(error);
};

export const errorHandler = (
  err: Error | AppError | ZodError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  if (err.name === 'CorsError') {
    res.status(403).json({
      success: false,
      error: 'Origin not allowed',
    });
    return;
  }

  const statusCode = err instanceof AppError ? err.statusCode : 500;
  console.error('[api-error]', {
    requestId: String(res.locals.requestId || '-'),
    method: req.method,
    url: redactUrlForLogs(req.originalUrl || req.url || '/'),
    statusCode,
    name: err.name || 'Error',
    ...(env.isDev ? safeDevelopmentError(err) : {}),
  });

  // Zod validation errors
  if (err instanceof ZodError) {
    const errors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    res.status(400).json({
      success: false,
      error: 'Validation failed',
      errors,
    });
    return;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    res.status(400).json({
      success: false,
      error: 'Invalid ID format',
    });
    return;
  }

  // Mongoose duplicate key error
  if ((err as { code?: number }).code === 11000) {
    const field = Object.keys((err as { keyValue?: Record<string, unknown> }).keyValue || {})[0];
    res.status(409).json({
      success: false,
      error: `Duplicate value for ${field}`,
    });
    return;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: 'Invalid token',
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: 'Token expired',
    });
    return;
  }

  // App errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // Default error
  const fallbackStatusCode = (err as AppError).statusCode || 500;
  const message = env.isProd ? 'Internal server error' : err.message;

  res.status(fallbackStatusCode).json({
    success: false,
    error: message,
    ...(env.isDev && { stack: err.stack }),
  });
};
