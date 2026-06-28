/**
 * Cache Middleware
 * Provides route-level caching with automatic invalidation
 */

import cacheService from '../services/cacheService.js';
import logger from '../utils/logger.js';

/**
 * Cache middleware factory
 * Creates a middleware that caches route responses
 */
export const cacheMiddleware = (options = {}) => {
  const {
    ttl = cacheService.TTL.MEDIUM,
    keyGenerator = null,
    condition = null,
  } = options;

  return async (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check condition if provided
    if (condition && !condition(req)) {
      return next();
    }

    try {
      // Generate cache key
      const cacheKey = keyGenerator 
        ? keyGenerator(req)
        : generateDefaultCacheKey(req);

      // Try to get from cache
      const cached = await cacheService.get(cacheKey);
      
      if (cached) {
        logger.debug('Cache hit for route:', { path: req.path, cacheKey });
        return res.json(cached);
      }

      // Store original json function
      const originalJson = res.json.bind(res);

      // Override json to cache the response
      res.json = function(data) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheService.set(cacheKey, data, ttl).catch((err) => {
            logger.error('Failed to cache response:', err);
          });
        }
        
        return originalJson(data);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      next();
    }
  };
};

/**
 * Generate default cache key from request
 */
const generateDefaultCacheKey = (req) => {
  const userId = req.user?.id || 'anonymous';
  const path = req.path;
  const query = JSON.stringify(req.query);
  return `route:${userId}:${path}:${query}`;
};

/**
 * Cache invalidation middleware
 * Automatically invalidates related caches after mutations
 */
export const cacheInvalidation = (options = {}) => {
  const {
    entity,
    strategy = 'user', // 'user', 'tenant', 'entity', 'custom'
    customInvalidation = null,
  } = options;

  return async (req, res, next) => {
    // Store original response methods
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    // Override to invalidate cache after successful response
    const invalidateAfterResponse = async (data) => {
      // Only invalidate after successful mutations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          if (customInvalidation) {
            await customInvalidation(req, res);
          } else {
            await performInvalidation(entity, strategy, req);
          }
        } catch (error) {
          logger.error('Cache invalidation error:', error);
        }
      }
      return data;
    };

    res.json = function(data) {
      invalidateAfterResponse(data).then(() => {
        originalJson(data);
      });
      return this;
    };

    res.send = function(data) {
      invalidateAfterResponse(data).then(() => {
        originalSend(data);
      });
      return this;
    };

    next();
  };
};

/**
 * Perform cache invalidation based on strategy
 */
const performInvalidation = async (entity, strategy, req) => {
  const userId = req.user?.id;
  const tenantId = req.user?.tenantId;

  switch (strategy) {
    case 'user':
      if (userId) {
        await cacheService.invalidateUserCache(userId);
      }
      break;

    case 'tenant':
      if (tenantId) {
        await cacheService.invalidateTenantCache(tenantId);
      }
      break;

    case 'entity':
      switch (entity) {
        case 'expense':
          await cacheService.invalidateExpenseCache(userId, tenantId);
          break;
        case 'category':
          await cacheService.invalidateCategoryCache(userId, tenantId);
          break;
        case 'goal':
          await cacheService.invalidateGoalCache(userId, tenantId);
          break;
        default:
          await cacheService.invalidateUserCache(userId);
      }
      break;

    default:
      logger.warn('Unknown invalidation strategy:', strategy);
  }
};

/**
 * Middleware to add cache headers to response
 */
export const cacheHeaders = (maxAge = 300) => {
  return (req, res, next) => {
    if (req.method === 'GET') {
      res.set('Cache-Control', `private, max-age=${maxAge}`);
    }
    next();
  };
};

/**
 * Route-specific cache helpers
 */
export const routeCache = {
  /**
   * Cache for list endpoints
   */
  list: (entity, ttl = cacheService.TTL.MEDIUM) => {
    return cacheMiddleware({
      ttl,
      keyGenerator: (req) => {
        const userId = req.user?.id;
        const filters = req.query;
        return cacheService.cacheKeys[`${entity}sList`](userId, filters);
      },
    });
  },

  /**
   * Cache for single entity endpoints
   */
  single: (entity, ttl = cacheService.TTL.LONG) => {
    return cacheMiddleware({
      ttl,
      keyGenerator: (req) => {
        const id = req.params.id;
        return cacheService.cacheKeys[entity](id);
      },
    });
  },

  /**
   * Cache for analytics endpoints
   */
  analytics: (type, ttl = cacheService.TTL.ANALYTICS) => {
    return cacheMiddleware({
      ttl,
      keyGenerator: (req) => {
        const userId = req.user?.id;
        const period = req.query.period || 'month';
        return cacheService.cacheKeys.analytics(userId, type, period);
      },
    });
  },
};

/**
 * Middleware to track cache performance
 */
export const cacheMetrics = () => {
  const metrics = {
    hits: 0,
    misses: 0,
    errors: 0,
  };

  return {
    middleware: (req, res, next) => {
      const startTime = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - startTime;
        const cacheStatus = res.getHeader('X-Cache-Status');

        if (cacheStatus === 'HIT') {
          metrics.hits++;
        } else if (cacheStatus === 'MISS') {
          metrics.misses++;
        }

        logger.debug('Cache metrics:', {
          path: req.path,
          cacheStatus,
          duration,
        });
      });

      next();
    },
    getMetrics: () => ({ ...metrics }),
    resetMetrics: () => {
      metrics.hits = 0;
      metrics.misses = 0;
      metrics.errors = 0;
    },
  };
};

export default {
  cacheMiddleware,
  cacheInvalidation,
  cacheHeaders,
  routeCache,
  cacheMetrics,
};
