# Database Query Optimization and Caching Guide

## Overview

This guide documents the comprehensive database query optimization and caching implementation for the WEALTH-VAULT backend. These enhancements significantly improve performance, reduce database load, and provide better scalability.

## Features Implemented

### 1. Database Indexes
- **Location**: `backend/db/migrations/add-performance-indexes.sql`
- **Purpose**: Optimize commonly queried fields for faster data retrieval

#### Index Categories:
- **Single Column Indexes**: For frequently filtered fields
- **Composite Indexes**: For queries with multiple conditions
- **Full-Text Search Indexes**: For text-based searches
- **JSONB Indexes**: For efficient JSON field queries

#### Key Indexes:
```sql
-- User-based queries
idx_expenses_user_date
idx_categories_user_active
idx_goals_user_status

-- Analytics queries
idx_expenses_analytics
idx_expenses_tenant_analytics

-- Full-text search
idx_expenses_description_gin
idx_categories_name_gin
```

### 2. Redis Caching Service
- **Location**: `backend/services/cacheService.js`
- **Features**:
  - Redis-based caching with in-memory fallback
  - Automatic cache key generation
  - TTL (Time-To-Live) management
  - Cache invalidation patterns
  - Query result caching

#### TTL Presets:
- **SHORT**: 60 seconds - Frequently changing data
- **MEDIUM**: 300 seconds (5 minutes) - Moderate change data
- **LONG**: 1800 seconds (30 minutes) - Rarely changing data
- **VERY_LONG**: 3600 seconds (1 hour) - Static-like data
- **ANALYTICS**: 600 seconds (10 minutes) - Analytics data

#### Usage Examples:

```javascript
import cacheService from '../services/cacheService.js';

// Basic cache operations
await cacheService.set('key', data, cacheService.TTL.MEDIUM);
const data = await cacheService.get('key');
await cacheService.del('key');

// Cache with automatic query execution
const result = await cacheService.cacheQuery(
  'my-cache-key',
  async () => {
    // Your database query here
    return await db.query.users.findMany();
  },
  cacheService.TTL.LONG
);

// Cache invalidation
await cacheService.invalidateUserCache(userId);
await cacheService.invalidateExpenseCache(userId, tenantId);
await cacheService.invalidateCategoryCache(userId, tenantId);
```

### 3. Cache Keys Generator
Standardized cache key generation for consistency:

```javascript
// Expense cache keys
cacheKeys.expense(expenseId)
cacheKeys.expensesList(userId, filters)

// Category cache keys
cacheKeys.category(categoryId)
cacheKeys.categoriesList(userId, filters)

// Goal cache keys
cacheKeys.goal(goalId)
cacheKeys.goalsList(userId, filters)

// Analytics cache keys
cacheKeys.analytics(userId, type, period)
```

### 4. Query Optimization Utilities
- **Location**: `backend/utils/queryOptimization.js`
- **Features**:
  - Batch loaders to avoid N+1 queries
  - Optimized query builders
  - Performance logging
  - Transaction helpers

#### Batch Loading:
```javascript
import { createCategoryLoader, loadRelatedData } from '../utils/queryOptimization.js';

// Create a batch loader
const categoryLoader = createCategoryLoader();

// Load multiple categories efficiently
const category1 = await categoryLoader.load(categoryId1);
const category2 = await categoryLoader.load(categoryId2);
// Both are fetched in a single query

// Load related data for bulk operations
const enrichedItems = await loadRelatedData(items, {
  category: { type: 'category', foreignKey: 'categoryId' },
  user: { type: 'user', foreignKey: 'userId' }
});
```

#### Query Execution with Logging:
```javascript
import { executeQuery } from '../utils/queryOptimization.js';

const result = await executeQuery(
  async () => {
    return await db.query.expenses.findMany();
  },
  'expenses.list'
);
// Automatically logs slow queries
```

### 5. Cache Middleware
- **Location**: `backend/middleware/cache.js`
- **Features**:
  - Route-level caching
  - Automatic cache invalidation
  - Cache headers management

#### Usage in Routes:
```javascript
import { routeCache, cacheInvalidation } from '../middleware/cache.js';

// Cache GET endpoints
router.get(
  '/expenses',
  protect,
  routeCache.list('expenses', cacheService.TTL.SHORT),
  async (req, res) => {
    // Your route handler
  }
);

// Cache single entity endpoints
router.get(
  '/expenses/:id',
  protect,
  routeCache.single('expense', cacheService.TTL.LONG),
  async (req, res) => {
    // Your route handler
  }
);

// Cache analytics endpoints
router.get(
  '/analytics/summary',
  protect,
  routeCache.analytics('summary', cacheService.TTL.ANALYTICS),
  async (req, res) => {
    // Your route handler
  }
);
```

### 6. Query Performance Tracker
- **Location**: `backend/utils/queryPerformanceTracker.js`
- **Features**:
  - Track all database queries
  - Identify slow queries
  - Generate performance reports
  - Provide optimization recommendations

#### Usage:
```javascript
import { trackQuery, queryTracker } from '../utils/queryPerformanceTracker.js';

// Track a query
const result = await trackQuery('expenses.list', { userId })(async () => {
  return await db.query.expenses.findMany();
});

// Get performance statistics
const stats = queryTracker.getStats();
const slowQueries = queryTracker.getSlowestQueries(10);
const report = queryTracker.generateReport();
```

### 7. Performance Monitoring API
- **Location**: `backend/routes/performance.js`
- **Endpoints**:

  ```
  GET  /api/performance/cache-stats      - Cache statistics
  GET  /api/performance/query-stats      - Database query statistics
  GET  /api/performance/report           - Comprehensive performance report
  POST /api/performance/clear-cache      - Clear all cache
  GET  /api/performance/slow-queries     - Get slowest queries
  GET  /api/performance/query-by-name    - Search queries by name
  GET  /api/performance/health           - System health status
  ```

## Implementation Guide

### Step 1: Run Database Migrations

Execute the performance indexes migration:

```bash
# Using PostgreSQL
psql -U username -d wealth_vault -f backend/db/migrations/add-performance-indexes.sql

# Or through your migration tool
npm run db:migrate
```

### Step 2: Update Environment Variables

Ensure Redis configuration is set in `.env`:

```env
REDIS_URL=redis://localhost:6379
# Or for remote Redis
REDIS_URL=redis://username:password@host:port
```

### Step 3: Register Performance Routes

Add performance monitoring routes to your main server file:

```javascript
// In backend/server.js
import performanceRoutes from './routes/performance.js';

app.use('/api/performance', performanceRoutes);
```

### Step 4: Apply Optimizations to Routes

Update your routes to use caching and query optimization:

```javascript
import cacheService from '../services/cacheService.js';
import { routeCache } from '../middleware/cache.js';
import { trackQuery } from '../utils/queryPerformanceTracker.js';

// Example: Optimized GET endpoint
router.get('/expenses', protect, async (req, res) => {
  const cacheKey = cacheService.cacheKeys.expensesList(req.user.id, req.query);
  
  const result = await cacheService.cacheQuery(
    cacheKey,
    async () => {
      return await trackQuery('expenses.list')(async () => {
        return await db.query.expenses.findMany({
          where: eq(expenses.userId, req.user.id),
          limit: 20
        });
      });
    },
    cacheService.TTL.SHORT
  );
  
  res.json({ success: true, data: result });
});

// Example: Mutation with cache invalidation
router.post('/expenses', protect, async (req, res) => {
  const newExpense = await db.insert(expenses).values(req.body).returning();
  
  // Invalidate related caches
  await cacheService.invalidateExpenseCache(req.user.id, req.user.tenantId);
  
  res.json({ success: true, data: newExpense });
});
```

## Performance Improvements

Based on typical workloads, you can expect:

1. **Query Response Time**: 50-90% reduction for cached data
2. **Database Load**: 40-70% reduction in query count
3. **API Response Time**: 30-60% improvement for list endpoints
4. **Scalability**: 3-5x more concurrent users supported

## Monitoring and Maintenance

### Check Cache Performance

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/performance/cache-stats
```

### Check Query Performance

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/performance/query-stats
```

### Generate Performance Report

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/performance/report
```

### Clear Cache (when needed)

```bash
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/performance/clear-cache
```

## Best Practices

### 1. Cache Timing
- Use **SHORT** TTL for frequently updated data (expenses, transactions)
- Use **MEDIUM** TTL for moderately updated data (categories, user settings)
- Use **LONG** TTL for rarely updated data (reference data, static content)
- Use **ANALYTICS** TTL for computed analytics data

### 2. Cache Invalidation
- Always invalidate caches after CREATE, UPDATE, DELETE operations
- Consider granular invalidation (specific IDs) vs. broad invalidation (all user data)
- Use patterns to invalidate related caches

### 3. Query Optimization
- Use batch loaders for N+1 query scenarios
- Leverage indexes for WHERE, JOIN, and ORDER BY clauses
- Use `trackQuery` to identify slow queries
- Review query tracker reports regularly

### 4. Error Handling
- Cache failures should not break functionality
- Always have fallbacks for cache misses
- Log cache errors for debugging

### 5. Memory Management
- Monitor Redis memory usage
- Set appropriate TTLs to prevent memory bloat
- Use cache eviction policies

## Troubleshooting

### Cache Not Working
1. Check Redis connection: `redis-cli ping`
2. Verify REDIS_URL in environment variables
3. Check application logs for cache errors
4. Verify cache service initialization

### Slow Queries Still Occurring
1. Run `GET /api/performance/slow-queries`
2. Check if indexes are properly created
3. Verify query optimization is applied
4. Review query execution plans

### High Memory Usage
1. Check cache TTLs are appropriate
2. Monitor Redis memory: `redis-cli info memory`
3. Consider reducing cache size or TTLs
4. Implement cache eviction policies

## Future Enhancements

1. **Cache Warming**: Pre-populate cache with frequently accessed data
2. **Smart Cache Prefetching**: Predict and cache likely next queries
3. **Distributed Caching**: Scale Redis with clustering
4. **Query Result Pagination**: Cache paginated results more efficiently
5. **Real-time Cache Invalidation**: Use Redis pub/sub for distributed invalidation

## Related Files

- Database Migrations: `backend/db/migrations/add-performance-indexes.sql`
- Cache Service: `backend/services/cacheService.js`
- Query Optimization: `backend/utils/queryOptimization.js`
- Cache Middleware: `backend/middleware/cache.js`
- Query Tracker: `backend/utils/queryPerformanceTracker.js`
- Performance Routes: `backend/routes/performance.js`
- Example Implementation: `backend/routes/expenses.js`

## Support

For questions or issues related to database optimization and caching:
1. Check the performance monitoring endpoints
2. Review application logs
3. Consult this documentation
4. Open an issue on GitHub

---

**Last Updated**: March 1, 2026
**Version**: 1.0.0
**Issue Reference**: #504
