/**
 * Pagination Utility
 * Provides consistent pagination functionality across all endpoints
 */

// Default pagination settings
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parse and validate pagination parameters
 */
export const parsePaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

/**
 * Create pagination metadata
 */
export const createPaginationMeta = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  return {
    currentPage: page,
    totalPages,
    totalItems: total,
    itemsPerPage: limit,
    hasNext,
    hasPrev,
    nextPage: hasNext ? page + 1 : null,
    prevPage: hasPrev ? page - 1 : null,
  };
};

/**
 * Parse and validate sorting parameters
 */
export const parseSortParams = (query, allowedFields = ['createdAt'], defaultField = 'createdAt') => {
  const sortBy = allowedFields.includes(query.sortBy) ? query.sortBy : defaultField;
  const sortOrder = ['asc', 'desc'].includes(query.sortOrder?.toLowerCase()) 
    ? query.sortOrder.toLowerCase() 
    : 'desc';

  return { sortBy, sortOrder };
};

/**
 * Parse search parameters
 */
export const parseSearchParams = (query) => {
  const search = query.search?.trim() || '';
  const searchFields = query.searchFields?.split(',') || [];

  return { search, searchFields };
};

/**
 * Parse filter parameters
 */
export const parseFilterParams = (query, allowedFilters = []) => {
  const filters = {};

  allowedFilters.forEach(filter => {
    if (query[filter] !== undefined && query[filter] !== '') {
      filters[filter] = query[filter];
    }
  });

  return filters;
};

/**
 * Parse date range parameters
 */
export const parseDateRangeParams = (query) => {
  const startDate = query.startDate ? new Date(query.startDate) : null;
  const endDate = query.endDate ? new Date(query.endDate) : null;

  // Validate dates
  const isValidStartDate = startDate && !isNaN(startDate.getTime());
  const isValidEndDate = endDate && !isNaN(endDate.getTime());

  return {
    startDate: isValidStartDate ? startDate : null,
    endDate: isValidEndDate ? endDate : null,
  };
};

/**
 * Complete query parser for list endpoints
 */
export const parseListQuery = (query, options = {}) => {
  const {
    allowedSortFields = ['createdAt'],
    defaultSortField = 'createdAt',
    allowedFilters = [],
    maxLimit = MAX_LIMIT,
  } = options;

  const pagination = parsePaginationParams(query);
  const sorting = parseSortParams(query, allowedSortFields, defaultSortField);
  const search = parseSearchParams(query);
  const filters = parseFilterParams(query, allowedFilters);
  const dateRange = parseDateRangeParams(query);

  // Override max limit if specified
  if (maxLimit && pagination.limit > maxLimit) {
    pagination.limit = maxLimit;
  }

  return {
    pagination,
    sorting,
    search,
    filters,
    dateRange,
  };
};

/**
 * Build pagination response
 */
export const buildPaginatedResponse = (data, page, limit, total, additionalMeta = {}) => {
  const pagination = createPaginationMeta(page, limit, total);
  
  return {
    items: data,
    pagination: {
      ...pagination,
      ...additionalMeta,
    },
  };
};

/**
 * Middleware to add pagination helpers to request
 */
export const paginationMiddleware = (options = {}) => {
  return (req, res, next) => {
    // Add pagination helpers to request
    req.parseQuery = (customOptions = {}) => {
      return parseListQuery(req.query, { ...options, ...customOptions });
    };

    req.buildPaginatedResponse = (data, total, additionalMeta = {}) => {
      const { pagination } = req.parseQuery();
      return buildPaginatedResponse(data, pagination.page, pagination.limit, total, additionalMeta);
    };

    next();
  };
};

export default {
  parsePaginationParams,
  createPaginationMeta,
  parseSortParams,
  parseSearchParams,
  parseFilterParams,
  parseDateRangeParams,
  parseListQuery,
  buildPaginatedResponse,
  paginationMiddleware,
};