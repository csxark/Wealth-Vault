# Database Query Optimization - Implementation Checklist

This checklist helps you apply query optimization and caching to your routes.

## ✅ Prerequisites Setup

- [x] Database indexes migration created (`add-performance-indexes.sql`)
- [ ] Database indexes applied (run the SQL migration)
- [x] Redis cache service implemented
- [x] Query optimization utilities created
- [x] Cache middleware implemented
- [x] Performance monitoring endpoints created
- [ ] Redis server running (check with `redis-cli ping`)
- [ ] REDIS_URL configured in `.env`

## 📋 For Each Route File

### 1. Import Required Modules

Add these imports at the top of your route file:

```javascript
import cacheService from '../services/cacheService.js';
import { routeCache } from '../middleware/cache.js';
import { trackQuery } from '../utils/queryPerformanceTracker.js';
import { executeQuery } from '../utils/queryOptimization.js';
```

### 2. Optimize GET Endpoints (List)

**Before:**
```javascript
router.get('/items', protect, async (req, res) => {
  const items = await db.query.items.findMany({
    where: eq(items.userId, req.user.id)
  });
  res.json({ success: true, data: items });
});
```

**After:**
```javascript
router.get('/items', protect, async (req, res) => {
  const cacheKey = cacheService.cacheKeys.itemsList(req.user.id, req.query);
  
  const items = await cacheService.cacheQuery(
    cacheKey,
    async () => {
      return await trackQuery('items.list', { userId: req.user.id })(async () => {
        return await db.query.items.findMany({
          where: eq(items.userId, req.user.id)
        });
      });
    },
    cacheService.TTL.SHORT
  );
  
  res.json({ success: true, data: items });
});
```

### 3. Optimize GET Endpoints (Single Item)

**Before:**
```javascript
router.get('/items/:id', protect, async (req, res) => {
  const item = await db.query.items.findFirst({
    where: eq(items.id, req.params.id)
  });
  res.json({ success: true, data: item });
});
```

**After:**
```javascript
router.get('/items/:id', protect, routeCache.single('item', cacheService.TTL.LONG), async (req, res) => {
  const item = await trackQuery('items.single')(async () => {
    return await db.query.items.findFirst({
      where: eq(items.id, req.params.id)
    });
  });
  res.json({ success: true, data: item });
});
```

### 4. Optimize Analytics Endpoints

**Before:**
```javascript
router.get('/stats', protect, async (req, res) => {
  const stats = await generateStats(req.user.id);
  res.json({ success: true, data: stats });
});
```

**After:**
```javascript
router.get('/stats', protect, async (req, res) => {
  const { period = 'month' } = req.query;
  const cacheKey = cacheService.cacheKeys.analytics(req.user.id, 'stats', period);
  
  const stats = await cacheService.cacheQuery(
    cacheKey,
    async () => generateStats(req.user.id),
    cacheService.TTL.ANALYTICS
  );
  
  res.json({ success: true, data: stats });
});
```

### 5. Add Cache Invalidation to POST Endpoints

**Before:**
```javascript
router.post('/items', protect, async (req, res) => {
  const newItem = await db.insert(items).values({
    ...req.body,
    userId: req.user.id
  }).returning();
  
  res.json({ success: true, data: newItem });
});
```

**After:**
```javascript
router.post('/items', protect, async (req, res) => {
  const newItem = await trackQuery('items.create')(async () => {
    return await db.insert(items).values({
      ...req.body,
      userId: req.user.id,
      tenantId: req.user.tenantId
    }).returning();
  });
  
  // Invalidate related caches
  await cacheService.invalidateItemCache(req.user.id, req.user.tenantId, newItem[0].id);
  
  res.json({ success: true, data: newItem });
});
```

### 6. Add Cache Invalidation to PUT Endpoints

**Before:**
```javascript
router.put('/items/:id', protect, async (req, res) => {
  const updated = await db.update(items)
    .set(req.body)
    .where(eq(items.id, req.params.id))
    .returning();
  
  res.json({ success: true, data: updated });
});
```

**After:**
```javascript
router.put('/items/:id', protect, async (req, res) => {
  const updated = await trackQuery('items.update')(async () => {
    return await db.update(items)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(items.id, req.params.id))
      .returning();
  });
  
  // Invalidate related caches
  await cacheService.invalidateItemCache(req.user.id, req.user.tenantId, req.params.id);
  
  res.json({ success: true, data: updated });
});
```

### 7. Add Cache Invalidation to DELETE Endpoints

**Before:**
```javascript
router.delete('/items/:id', protect, async (req, res) => {
  await db.delete(items).where(eq(items.id, req.params.id));
  res.json({ success: true, message: 'Deleted' });
});
```

**After:**
```javascript
router.delete('/items/:id', protect, async (req, res) => {
  await db.delete(items).where(eq(items.id, req.params.id));
  
  // Invalidate related caches
  await cacheService.invalidateItemCache(req.user.id, req.user.tenantId, req.params.id);
  
  res.json({ success: true, message: 'Deleted' });
});
```

## 🔑 Cache Key Naming Convention

Add cache key generators for your entity in `cacheService.js`:

```javascript
export const cacheKeys = {
  // ... existing keys ...
  
  // Your entity cache keys
  item: (itemId) => generateKey(CACHE_PREFIXES.ITEM, itemId),
  itemsList: (userId, filters = {}) => {
    const filterStr = Object.entries(filters)
      .sort()
      .map(([k, v]) => `${k}:${v}`)
      .join(':');
    return generateKey(CACHE_PREFIXES.ITEMS_LIST, userId, filterStr);
  },
};
```

And add cache prefixes:

```javascript
const CACHE_PREFIXES = {
  // ... existing prefixes ...
  ITEM: 'item:',
  ITEMS_LIST: 'items:list:',
};
```

## 🗑️ Cache Invalidation Functions

Add invalidation functions for your entity in `cacheService.js`:

```javascript
/**
 * Invalidate item-related caches
 */
export const invalidateItemCache = async (userId, tenantId, itemId = null) => {
  const patterns = [
    `${CACHE_PREFIXES.ITEMS_LIST}${userId}*`,
    `${CACHE_PREFIXES.ITEMS_LIST}${tenantId}*`,
  ];

  if (itemId) {
    patterns.push(`${CACHE_PREFIXES.ITEM}${itemId}`);
  }

  for (const pattern of patterns) {
    await deletePattern(pattern);
  }
  
  logger.info('Item cache invalidated:', { userId, tenantId, itemId });
};
```

## 🎯 TTL Selection Guide

Choose the appropriate TTL based on data volatility:

- **TTL.SHORT (60s)**: Frequently changing data
  - Expenses list
  - Recent transactions
  - Real-time dashboards

- **TTL.MEDIUM (5min)**: Moderately changing data
  - Categories list
  - User settings
  - General lists

- **TTL.LONG (30min)**: Rarely changing data
  - User profile
  - Single item details
  - Reference data

- **TTL.ANALYTICS (10min)**: Computed/aggregated data
  - Statistics
  - Charts data
  - Reports

## 📊 Monitoring Checklist

After implementation, verify:

- [ ] Cache hit rate > 50% (check `/api/performance/cache-stats`)
- [ ] No queries > 3 seconds (check `/api/performance/slow-queries`)
- [ ] Average query time < 500ms (check `/api/performance/query-stats`)
- [ ] Cache invalidation working after mutations
- [ ] No stale data issues
- [ ] Memory usage acceptable

## 🧪 Testing Checklist

Test the following scenarios:

- [ ] GET request returns cached data on second call
- [ ] POST/PUT/DELETE invalidates cache
- [ ] Stale data not served
- [ ] Cache fallback works when Redis is down
- [ ] Performance improvement measurable

## 📁 Files to Apply Optimizations

Apply to these route files in order of priority:

### High Priority (Performance Critical)
- [ ] `backend/routes/expenses.js` ✅ (Already done as example)
- [ ] `backend/routes/analytics.js`
- [ ] `backend/routes/goals.js`
- [ ] `backend/routes/categories.js`

### Medium Priority
- [ ] `backend/routes/users.js`
- [ ] `backend/routes/tenants.js`
- [ ] `backend/routes/auth.js` (for profile endpoints)

### Low Priority
- [ ] `backend/routes/health.js`
- [ ] Other utility routes

## 🚀 Deployment Checklist

Before deploying to production:

- [ ] Run database index migration
- [ ] Configure Redis in production environment
- [ ] Test Redis connection
- [ ] Set appropriate TTLs for production
- [ ] Enable performance monitoring
- [ ] Set up alerts for slow queries
- [ ] Document cache invalidation patterns
- [ ] Train team on monitoring endpoints

## 📚 Resources

- [Database Optimization Guide](./DATABASE_OPTIMIZATION_GUIDE.md)
- Cache Service: `backend/services/cacheService.js`
- Query Optimization Utils: `backend/utils/queryOptimization.js`
- Example Implementation: `backend/routes/expenses.js`

## 🆘 Common Issues

### Issue: Cache not invalidating
**Solution**: Ensure you're calling the invalidation function after mutations and passing correct IDs.

### Issue: Stale data being served
**Solution**: Check TTL values and invalidation patterns. May need to reduce TTL or improve invalidation.

### Issue: Memory errors with Redis
**Solution**: Reduce TTLs, implement eviction policies, or scale Redis.

### Issue: Slow queries still occurring
**Solution**: Verify indexes are created, check query execution plans, use batch loaders for N+1 queries.

---

**Note**: Mark items as complete as you implement them. The expenses route is already done as a reference implementation.
