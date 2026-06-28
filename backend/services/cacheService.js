/**
 * Cache Service
 * Provides a comprehensive caching layer using Redis with fallback to in-memory cache
 * Handles cache invalidation patterns and provides query result caching
 */

import { getRedisClient, isRedisAvailable } from '../config/redis.js';
import logger from '../utils/logger.js';

// In-memory cache fallback
const memoryCache = new Map();
const memoryCacheExpiry = new Map();

// Cache key prefixes for organization
const CACHE_PREFIXES = {
  USER: 'user:',
  EXPENSE: 'expense:',
  EXPENSES_LIST: 'expenses:list:',
  CATEGORY: 'category:',
  CATEGORIES_LIST: 'categories:list:',
  GOAL: 'goal:',
  GOALS_LIST: 'goals:list:',
  ANALYTICS: 'analytics:',
  TENANT: 'tenant:',
  TENANT_MEMBERS: 'tenant:members:',
};

// Default TTL values (in seconds)
const DEFAULT_TTL = {
  SHORT: 60,           // 1 minute - for frequently changing data
  MEDIUM: 300,         // 5 minutes - for moderate change data
  LONG: 1800,          // 30 minutes - for rarely changing data
  VERY_LONG: 3600,     // 1 hour - for static-like data
  ANALYTICS: 600,      // 10 minutes - for analytics data
};

/**
 * Generate cache key with prefix
 */
const generateKey = (prefix, ...parts) => {
  return `${prefix}${parts.filter(Boolean).join(':')}`;
};

/**
 * Clean expired entries from memory cache
 */
const cleanMemoryCache = () => {
  const now = Date.now();
  for (const [key, expiry] of memoryCacheExpiry.entries()) {
    if (expiry < now) {
      memoryCache.delete(key);
      memoryCacheExpiry.delete(key);
    }
  }
};

// Clean memory cache every minute
setInterval(cleanMemoryCache, 60000);

/**
 * Get cached value
 */
export const get = async (key) => {
  try {
    if (isRedisAvailable()) {
      const redisClient = getRedisClient();
      const value = await redisClient.get(key);
      if (value) {
        return JSON.parse(value);
      }
      return null;
    } else {
      // Fallback to memory cache
      const expiry = memoryCacheExpiry.get(key);
      if (expiry && expiry > Date.now()) {
        return memoryCache.get(key);
      } else {
        memoryCache.delete(key);
        memoryCacheExpiry.delete(key);
        return null;
      }
    }
  } catch (error) {
    logger.error('Cache get error:', { key, error: error.message });
    return null;
  }
};

/**
 * Set cached value with TTL
 */
export const set = async (key, value, ttl = DEFAULT_TTL.MEDIUM) => {
  try {
    if (isRedisAvailable()) {
      const redisClient = getRedisClient();
      await redisClient.setEx(key, ttl, JSON.stringify(value));
    } else {
      // Fallback to memory cache
      memoryCache.set(key, value);
      memoryCacheExpiry.set(key, Date.now() + (ttl * 1000));
    }
  } catch (error) {
    logger.error('Cache set error:', { key, error: error.message });
  }
};

/**
 * Delete cached value
 */
export const del = async (key) => {
  try {
    if (isRedisAvailable()) {
      const redisClient = getRedisClient();
      await redisClient.del(key);
    } else {
      memoryCache.delete(key);
      memoryCacheExpiry.delete(key);
    }
  } catch (error) {
    logger.error('Cache delete error:', { key, error: error.message });
  }
};

/**
 * Delete multiple keys matching a pattern
 */
export const deletePattern = async (pattern) => {
  try {
    if (isRedisAvailable()) {
      const redisClient = getRedisClient();
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
      return keys.length;
    } else {
      // Fallback to memory cache
      const regex = new RegExp(pattern.replace('*', '.*'));
      let count = 0;
      for (const key of memoryCache.keys()) {
        if (regex.test(key)) {
          memoryCache.delete(key);
          memoryCacheExpiry.delete(key);
          count++;
        }
      }
      return count;
    }
  } catch (error) {
    logger.error('Cache deletePattern error:', { pattern, error: error.message });
    return 0;
  }
};

/**
 * Cache a function result with automatic key generation
 */
export const cacheQuery = async (key, queryFn, ttl = DEFAULT_TTL.MEDIUM) => {
  try {
    // Try to get from cache first
    const cached = await get(key);
    if (cached !== null) {
      logger.debug('Cache hit:', { key });
      return cached;
    }

    // Cache miss - execute query
    logger.debug('Cache miss:', { key });
    const result = await queryFn();
    
    // Store in cache
    await set(key, result, ttl);
    
    return result;
  } catch (error) {
    logger.error('Cache query error:', { key, error: error.message });
    // On error, execute query directly
    return await queryFn();
  }
};

/**
 * Invalidate all caches related to a user
 */
export const invalidateUserCache = async (userId) => {
  const patterns = [
    `${CACHE_PREFIXES.EXPENSES_LIST}${userId}*`,
    `${CACHE_PREFIXES.CATEGORIES_LIST}${userId}*`,
    `${CACHE_PREFIXES.GOALS_LIST}${userId}*`,
    `${CACHE_PREFIXES.ANALYTICS}${userId}*`,
    `${CACHE_PREFIXES.USER}${userId}*`,
  ];

  for (const pattern of patterns) {
    await deletePattern(pattern);
  }
  
  logger.info('User cache invalidated:', { userId });
};

/**
 * Invalidate expense-related caches
 */
export const invalidateExpenseCache = async (userId, tenantId, expenseId = null) => {
  const patterns = [
    `${CACHE_PREFIXES.EXPENSES_LIST}${userId}*`,
    `${CACHE_PREFIXES.EXPENSES_LIST}${tenantId}*`,
    `${CACHE_PREFIXES.ANALYTICS}${userId}*`,
    `${CACHE_PREFIXES.ANALYTICS}${tenantId}*`,
  ];

  if (expenseId) {
    patterns.push(`${CACHE_PREFIXES.EXPENSE}${expenseId}`);
  }

  for (const pattern of patterns) {
    await deletePattern(pattern);
  }
  
  logger.info('Expense cache invalidated:', { userId, tenantId, expenseId });
};

/**
 * Invalidate category-related caches
 */
export const invalidateCategoryCache = async (userId, tenantId, categoryId = null) => {
  const patterns = [
    `${CACHE_PREFIXES.CATEGORIES_LIST}${userId}*`,
    `${CACHE_PREFIXES.CATEGORIES_LIST}${tenantId}*`,
    `${CACHE_PREFIXES.ANALYTICS}${userId}*`,
  ];

  if (categoryId) {
    patterns.push(`${CACHE_PREFIXES.CATEGORY}${categoryId}`);
  }

  for (const pattern of patterns) {
    await deletePattern(pattern);
  }
  
  logger.info('Category cache invalidated:', { userId, tenantId, categoryId });
};

/**
 * Invalidate goal-related caches
 */
export const invalidateGoalCache = async (userId, tenantId, goalId = null) => {
  const patterns = [
    `${CACHE_PREFIXES.GOALS_LIST}${userId}*`,
    `${CACHE_PREFIXES.GOALS_LIST}${tenantId}*`,
  ];

  if (goalId) {
    patterns.push(`${CACHE_PREFIXES.GOAL}${goalId}`);
  }

  for (const pattern of patterns) {
    await deletePattern(pattern);
  }
  
  logger.info('Goal cache invalidated:', { userId, tenantId, goalId });
};

/**
 * Invalidate all tenant-related caches
 */
export const invalidateTenantCache = async (tenantId) => {
  const patterns = [
    `${CACHE_PREFIXES.TENANT}${tenantId}*`,
    `${CACHE_PREFIXES.TENANT_MEMBERS}${tenantId}*`,
    `${CACHE_PREFIXES.EXPENSES_LIST}*${tenantId}*`,
    `${CACHE_PREFIXES.CATEGORIES_LIST}*${tenantId}*`,
    `${CACHE_PREFIXES.GOALS_LIST}*${tenantId}*`,
    `${CACHE_PREFIXES.ANALYTICS}*${tenantId}*`,
  ];

  for (const pattern of patterns) {
    await deletePattern(pattern);
  }
  
  logger.info('Tenant cache invalidated:', { tenantId });
};

/**
 * Get cache statistics
 */
export const getCacheStats = async () => {
  try {
    if (isRedisAvailable()) {
      const redisClient = getRedisClient();
      const info = await redisClient.info('stats');
      return {
        type: 'redis',
        available: true,
        info: info,
      };
    } else {
      return {
        type: 'memory',
        available: true,
        size: memoryCache.size,
        keys: Array.from(memoryCache.keys()),
      };
    }
  } catch (error) {
    return {
      type: 'none',
      available: false,
      error: error.message,
    };
  }
};

/**
 * Clear all cache
 */
export const clearAll = async () => {
  try {
    if (isRedisAvailable()) {
      const redisClient = getRedisClient();
      await redisClient.flushDb();
    } else {
      memoryCache.clear();
      memoryCacheExpiry.clear();
    }
    logger.info('All cache cleared');
  } catch (error) {
    logger.error('Clear cache error:', error);
  }
};

// Export cache key generators
export const cacheKeys = {
  // User cache keys
  user: (userId) => generateKey(CACHE_PREFIXES.USER, userId),
  
  // Expense cache keys
  expense: (expenseId) => generateKey(CACHE_PREFIXES.EXPENSE, expenseId),
  expensesList: (userId, filters = {}) => {
    const filterStr = Object.entries(filters)
      .sort()
      .map(([k, v]) => `${k}:${v}`)
      .join(':');
    return generateKey(CACHE_PREFIXES.EXPENSES_LIST, userId, filterStr);
  },
  
  // Category cache keys
  category: (categoryId) => generateKey(CACHE_PREFIXES.CATEGORY, categoryId),
  categoriesList: (userId, filters = {}) => {
    const filterStr = Object.entries(filters)
      .sort()
      .map(([k, v]) => `${k}:${v}`)
      .join(':');
    return generateKey(CACHE_PREFIXES.CATEGORIES_LIST, userId, filterStr);
  },
  
  // Goal cache keys
  goal: (goalId) => generateKey(CACHE_PREFIXES.GOAL, goalId),
  goalsList: (userId, filters = {}) => {
    const filterStr = Object.entries(filters)
      .sort()
      .map(([k, v]) => `${k}:${v}`)
      .join(':');
    return generateKey(CACHE_PREFIXES.GOALS_LIST, userId, filterStr);
  },
  
  // Analytics cache keys
  analytics: (userId, type, period) => 
    generateKey(CACHE_PREFIXES.ANALYTICS, userId, type, period),
  
  // Tenant cache keys
  tenant: (tenantId) => generateKey(CACHE_PREFIXES.TENANT, tenantId),
  tenantMembers: (tenantId) => generateKey(CACHE_PREFIXES.TENANT_MEMBERS, tenantId),
};

// Export TTL constants
export const TTL = DEFAULT_TTL;

export default {
  get,
  set,
  del,
  deletePattern,
  cacheQuery,
  invalidateUserCache,
  invalidateExpenseCache,
  invalidateCategoryCache,
  invalidateGoalCache,
  invalidateTenantCache,
  getCacheStats,
  clearAll,
  cacheKeys,
  TTL,
};
