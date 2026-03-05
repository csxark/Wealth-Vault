/**
 * Query Optimization Utilities
 * Provides utilities to avoid N+1 queries and optimize database operations
 */

import { eq, and, inArray, gte, lte, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { categories, users } from '../db/schema.js';
import logger from '../utils/logger.js';

/**
 * Batch loader for efficient data fetching
 * Helps avoid N+1 query problems
 */
class BatchLoader {
  constructor(loadFn, keyFn = (item) => item.id) {
    this.loadFn = loadFn;
    this.keyFn = keyFn;
    this.cache = new Map();
    this.queue = new Set();
    this.batchPromise = null;
  }

  async load(key) {
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // Add to queue
    this.queue.add(key);

    // Schedule batch execution
    if (!this.batchPromise) {
      this.batchPromise = new Promise((resolve) => {
        process.nextTick(() => {
          this.executeBatch();
          resolve();
        });
      });
    }

    await this.batchPromise;
    return this.cache.get(key);
  }

  async executeBatch() {
    const keys = Array.from(this.queue);
    this.queue.clear();
    this.batchPromise = null;

    try {
      const items = await this.loadFn(keys);
      
      // Cache results
      for (const item of items) {
        const key = this.keyFn(item);
        this.cache.set(key, item);
      }

      // Set null for missing items
      for (const key of keys) {
        if (!this.cache.has(key)) {
          this.cache.set(key, null);
        }
      }
    } catch (error) {
      logger.error('Batch loader error:', error);
      // Set null for all keys on error
      for (const key of keys) {
        this.cache.set(key, null);
      }
    }
  }

  clear() {
    this.cache.clear();
  }
}

/**
 * Create a category batch loader
 */
export const createCategoryLoader = () => {
  return new BatchLoader(async (categoryIds) => {
    if (categoryIds.length === 0) return [];
    
    const results = await db
      .select()
      .from(categories)
      .where(inArray(categories.id, categoryIds));
    
    return results;
  });
};

/**
 * Create a user batch loader
 */
export const createUserLoader = () => {
  return new BatchLoader(async (userIds) => {
    if (userIds.length === 0) return [];
    
    const results = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        profilePicture: users.profilePicture,
      })
      .from(users)
      .where(inArray(users.id, userIds));
    
    return results;
  });
};

/**
 * Efficiently load related data for a list of items
 * Avoids N+1 queries by batching related data fetches
 */
export const loadRelatedData = async (items, relationships) => {
  const loaders = {};

  // Create loaders for each relationship
  for (const [relationName, config] of Object.entries(relationships)) {
    if (config.type === 'category') {
      loaders[relationName] = createCategoryLoader();
    } else if (config.type === 'user') {
      loaders[relationName] = createUserLoader();
    }
  }

  // Load related data for all items
  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      const related = {};
      
      for (const [relationName, config] of Object.entries(relationships)) {
        const foreignKey = config.foreignKey;
        const value = item[foreignKey];
        
        if (value && loaders[relationName]) {
          related[relationName] = await loaders[relationName].load(value);
        } else {
          related[relationName] = null;
        }
      }
      
      return { ...item, ...related };
    })
  );

  return enrichedItems;
};

/**
 * Build optimized query with relations
 * Uses Drizzle's query builder optimally
 */
export const buildOptimizedQuery = (baseQuery, options = {}) => {
  const {
    select,
    with: withRelations,
    where,
    orderBy,
    limit,
    offset,
  } = options;

  let query = baseQuery;

  // Apply select if specified
  if (select) {
    query = query.select(select);
  }

  // Apply where conditions
  if (where) {
    query = query.where(where);
  }

  // Apply ordering
  if (orderBy) {
    query = query.orderBy(orderBy);
  }

  // Apply pagination
  if (limit) {
    query = query.limit(limit);
  }

  if (offset) {
    query = query.offset(offset);
  }

  return query;
};

/**
 * Execute query with automatic performance logging
 */
export const executeQuery = async (queryFn, queryName = 'query') => {
  const startTime = Date.now();
  
  try {
    const result = await queryFn();
    const duration = Date.now() - startTime;
    
    if (duration > 1000) {
      logger.warn('Slow query detected:', { queryName, duration });
    } else {
      logger.debug('Query executed:', { queryName, duration });
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Query error:', { queryName, duration, error: error.message });
    throw error;
  }
};

/**
 * Paginate query results efficiently
 */
export const paginateQuery = async (
  queryFn,
  countFn,
  page = 1,
  limit = 20
) => {
  const offset = (page - 1) * limit;
  
  const [items, countResult] = await Promise.all([
    queryFn(limit, offset),
    countFn(),
  ]);

  const total = Number(countResult);
  const totalPages = Math.ceil(total / limit);

  return {
    items,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
};

/**
 * Deduplicate array by key
 */
export const deduplicateBy = (array, keyFn) => {
  const seen = new Set();
  return array.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

/**
 * Group array by key
 */
export const groupBy = (array, keyFn) => {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {});
};

/**
 * Create a query cache key from query parameters
 */
export const createQueryCacheKey = (prefix, params) => {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  
  return `${prefix}:${sortedParams}`;
};

/**
 * Bulk insert with conflict handling
 */
export const bulkInsertWithConflict = async (table, data, conflictTarget, updateColumns) => {
  if (data.length === 0) return [];
  
  try {
    const result = await db
      .insert(table)
      .values(data)
      .onConflictDoUpdate({
        target: conflictTarget,
        set: updateColumns.reduce((acc, col) => {
          acc[col] = sql`excluded.${col}`;
          return acc;
        }, {}),
      })
      .returning();
    
    return result;
  } catch (error) {
    logger.error('Bulk insert error:', error);
    throw error;
  }
};

/**
 * Transaction helper with automatic rollback on error
 */
export const withTransaction = async (callback) => {
  try {
    return await db.transaction(async (tx) => {
      return await callback(tx);
    });
  } catch (error) {
    logger.error('Transaction error:', error);
    throw error;
  }
};

/**
 * Build date range conditions
 */
export const buildDateRangeCondition = (field, startDate, endDate) => {
  const conditions = [];
  
  if (startDate) {
    conditions.push(gte(field, new Date(startDate)));
  }
  
  if (endDate) {
    conditions.push(lte(field, new Date(endDate)));
  }
  
  return conditions;
};

/**
 * Create optimized aggregation query
 */
export const createAggregationQuery = (
  table,
  groupByFields,
  aggregations,
  whereConditions = []
) => {
  const selectFields = {};
  
  // Add group by fields
  groupByFields.forEach((field) => {
    selectFields[field.name] = field.column;
  });
  
  // Add aggregations
  aggregations.forEach((agg) => {
    selectFields[agg.name] = agg.expression;
  });
  
  let query = db.select(selectFields).from(table);
  
  if (whereConditions.length > 0) {
    query = query.where(and(...whereConditions));
  }
  
  const groupByColumns = groupByFields.map((field) => field.column);
  if (groupByColumns.length > 0) {
    query = query.groupBy(...groupByColumns);
  }
  
  return query;
};

/**
 * Parallel query execution
 */
export const executeParallel = async (queries) => {
  try {
    return await Promise.all(queries);
  } catch (error) {
    logger.error('Parallel query error:', error);
    throw error;
  }
};

export default {
  BatchLoader,
  createCategoryLoader,
  createUserLoader,
  loadRelatedData,
  buildOptimizedQuery,
  executeQuery,
  paginateQuery,
  deduplicateBy,
  groupBy,
  createQueryCacheKey,
  bulkInsertWithConflict,
  withTransaction,
  buildDateRangeCondition,
  createAggregationQuery,
  executeParallel,
};
