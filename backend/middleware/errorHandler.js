import { AppError } from '../utils/errors.js';

/**
 * Centralized error handling middleware
 * Catches all errors and sends appropriate responses
 */
export const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;
  
  // Log error for debugging (in production, use proper logging service)
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', {
      message: err.message,
      stack: err.stack,
      statusCode: error.statusCode,
      url: req.originalUrl,
      method: req.method,
    });
  } else {
    // In production, only log operational errors details
    if (err.isOperational) {
      console.error('Operational Error:', err.message);
    } else {
      console.error('Critical Error:', err.stack);
    }
  }
  
  // Mongoose/Drizzle validation error
  if (err.name === 'ValidationError') {
    const message = 'Validation failed';
    const errors = Object.values(err.errors || {}).map(e => e.message);
    error = new AppError(message, 400);
    error.errors = errors;
  }
  
  // Mongoose duplicate key error
  if (err.code === 11000 || err.code === '23505') {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const message = `Duplicate ${field}. This ${field} already exists.`;
    error = new AppError(message, 409);
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token. Please log in again.';
    error = new AppError(message, 401);
  }
  
  if (err.name === 'TokenExpiredError') {
    const message = 'Your token has expired. Please log in again.';
    error = new AppError(message, 401);
  }
  
  // PostgreSQL errors
  if (err.code && err.code.startsWith('23')) {
    if (err.code === '23505') {
      error = new AppError('Duplicate entry. This record already exists.', 409);
    } else if (err.code === '23503') {
      error = new AppError('Referenced resource not found.', 404);
    } else {
      error = new AppError('Database constraint violation.', 400);
    }
  }
  
  // Send response
  const response = {
    success: false,
    message: error.message || 'Something went wrong',
    status: error.status || 'error',
  };
  
  // Add additional error details in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
    response.error = err;
  }
  
  // Add validation errors if present
  if (error.errors) {
    response.errors = error.errors;
  }
  
  // Don't expose internal error details in production
  if (!err.isOperational && process.env.NODE_ENV === 'production') {
    response.message = 'Something went wrong. Please try again later.';
  }
  
  res.status(error.statusCode).json(response);
};

/**
 * Async handler wrapper to catch errors in async route handlers
 * Use this to wrap async route handlers instead of try-catch
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 handler for undefined routes
 */
export const notFound = (req, res, next) => {
  const error = new AppError(
    `Route ${req.originalUrl} not found`,
    404
  );
  next(error);
};
