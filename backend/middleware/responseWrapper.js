/**
 * Standard API Response Wrapper Middleware
 * Ensures consistent response format across all endpoints
 */

// Standard HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// Standard error codes
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
};

/**
 * Standard success response format
 */
export const successResponse = (res, data = null, message = 'Success', statusCode = HTTP_STATUS.OK, meta = {}) => {
  const response = {
    success: true,
    message,
    timestamp: new Date().toISOString(),
    ...meta
  };

  if (data !== null) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

/**
 * Standard error response format
 */
export const errorResponse = (res, message = 'An error occurred', statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errorCode = ERROR_CODES.INTERNAL_ERROR, details = null) => {
  const response = {
    success: false,
    message,
    error: {
      code: errorCode,
      timestamp: new Date().toISOString(),
    }
  };

  if (details) {
    response.error.details = details;
  }

  return res.status(statusCode).json(response);
};

/**
 * Paginated response format
 */
export const paginatedResponse = (res, data, pagination, message = 'Success') => {
  return successResponse(res, data, message, HTTP_STATUS.OK, { pagination });
};

/**
 * Created response format
 */
export const createdResponse = (res, data, message = 'Resource created successfully') => {
  return successResponse(res, data, message, HTTP_STATUS.CREATED);
};

/**
 * No content response format
 */
export const noContentResponse = (res, message = 'Operation completed successfully') => {
  return res.status(HTTP_STATUS.NO_CONTENT).json({
    success: true,
    message,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Validation error response
 */
export const validationErrorResponse = (res, errors, message = 'Validation failed') => {
  return errorResponse(
    res, 
    message, 
    HTTP_STATUS.BAD_REQUEST, 
    ERROR_CODES.VALIDATION_ERROR, 
    { validation: errors }
  );
};

/**
 * Not found response
 */
export const notFoundResponse = (res, resource = 'Resource', message = null) => {
  const defaultMessage = `${resource} not found`;
  return errorResponse(
    res, 
    message || defaultMessage, 
    HTTP_STATUS.NOT_FOUND, 
    ERROR_CODES.NOT_FOUND
  );
};

/**
 * Unauthorized response
 */
export const unauthorizedResponse = (res, message = 'Authentication required') => {
  return errorResponse(
    res, 
    message, 
    HTTP_STATUS.UNAUTHORIZED, 
    ERROR_CODES.AUTHENTICATION_ERROR
  );
};

/**
 * Forbidden response
 */
export const forbiddenResponse = (res, message = 'Access denied') => {
  return errorResponse(
    res, 
    message, 
    HTTP_STATUS.FORBIDDEN, 
    ERROR_CODES.AUTHORIZATION_ERROR
  );
};

/**
 * Conflict response
 */
export const conflictResponse = (res, message = 'Resource already exists') => {
  return errorResponse(
    res, 
    message, 
    HTTP_STATUS.CONFLICT, 
    ERROR_CODES.CONFLICT
  );
};

/**
 * Response wrapper middleware
 * Adds helper methods to res object
 */
export const responseWrapper = (req, res, next) => {
  // Add helper methods to response object
  res.success = (data, message, meta) => successResponse(res, data, message, HTTP_STATUS.OK, meta);
  res.created = (data, message) => createdResponse(res, data, message);
  res.noContent = (message) => noContentResponse(res, message);
  res.paginated = (data, pagination, message) => paginatedResponse(res, data, pagination, message);
  
  res.badRequest = (message, details) => errorResponse(res, message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, details);
  res.unauthorized = (message) => unauthorizedResponse(res, message);
  res.forbidden = (message) => forbiddenResponse(res, message);
  res.notFound = (resource, message) => notFoundResponse(res, resource, message);
  res.conflict = (message) => conflictResponse(res, message);
  res.validationError = (errors, message) => validationErrorResponse(res, errors, message);
  res.serverError = (message, details) => errorResponse(res, message, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.INTERNAL_ERROR, details);

  next();
};

export default {
  HTTP_STATUS,
  ERROR_CODES,
  successResponse,
  errorResponse,
  paginatedResponse,
  createdResponse,
  noContentResponse,
  validationErrorResponse,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
  conflictResponse,
  responseWrapper,
};