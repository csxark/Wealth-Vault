import { HTTP_STATUS, ERROR_CODES, errorResponse } from './responseWrapper.js';

/**
 * Enhanced Error Handler Middleware
 * Provides consistent error responses across the application
 */

// Custom error classes
export class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = HTTP_STATUS.BAD_REQUEST;
    this.errorCode = ERROR_CODES.VALIDATION_ERROR;
    this.details = details;
  }
}

export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = HTTP_STATUS.CONFLICT;
    this.errorCode = ERROR_CODES.CONFLICT;
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = HTTP_STATUS.UNAUTHORIZED;
    this.errorCode = ERROR_CODES.AUTHENTICATION_ERROR;
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = HTTP_STATUS.NOT_FOUND;
    this.errorCode = ERROR_CODES.NOT_FOUND;
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = HTTP_STATUS.FORBIDDEN;
    this.errorCode = ERROR_CODES.AUTHORIZATION_ERROR;
  }
}

// Async handler wrapper
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Enhanced error handler middleware
export const errorHandler = (err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
  });

  // Handle custom errors
  if (err.statusCode && err.errorCode) {
    return errorResponse(res, err.message, err.statusCode, err.errorCode, err.details);
  }

  // Handle validation errors from express-validator
  if (err.array && typeof err.array === 'function') {
    return errorResponse(
      res,
      'Validation failed',
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.VALIDATION_ERROR,
      { validation: err.array() }
    );
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return errorResponse(
      res,
      'Invalid token',
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.AUTHENTICATION_ERROR
    );
  }

  if (err.name === 'TokenExpiredError') {
    return errorResponse(
      res,
      'Token expired',
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.AUTHENTICATION_ERROR,
      { shouldRefresh: true }
    );
  }

  // Handle database errors
  if (err.code === '23505') { // PostgreSQL unique violation
    return errorResponse(
      res,
      'Resource already exists',
      HTTP_STATUS.CONFLICT,
      ERROR_CODES.CONFLICT
    );
  }

  if (err.code === '23503') { // PostgreSQL foreign key violation
    return errorResponse(
      res,
      'Referenced resource not found',
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  // Handle rate limiting errors
  if (err.status === 429) {
    return errorResponse(
      res,
      'Too many requests',
      HTTP_STATUS.TOO_MANY_REQUESTS,
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      { retryAfter: err.retryAfter }
    );
  }

  // Default server error
  return errorResponse(
    res,
    process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    ERROR_CODES.INTERNAL_ERROR,
    process.env.NODE_ENV === 'development' ? { stack: err.stack } : null
  );
};

// 404 handler for undefined routes
export const notFound = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

export default {
  ValidationError,
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
  asyncHandler,
  errorHandler,
  notFound,
};
