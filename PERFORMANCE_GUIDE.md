# Performance & Monitoring Guide

## Overview

This guide explains how Wealth Vault approaches performance and how to monitor the system in real time. It ties together the database/query optimization work, Redis-based caching layer, and the built‑in performance monitoring API so contributors can make informed optimization decisions.

For deeper backend details, see:
- [backend/DATABASE_OPTIMIZATION_GUIDE.md](backend/DATABASE_OPTIMIZATION_GUIDE.md)
- [backend/OPTIMIZATION_SUMMARY.md](backend/OPTIMIZATION_SUMMARY.md)
- [backend/OPTIMIZATION_CHECKLIST.md](backend/OPTIMIZATION_CHECKLIST.md)
- [DB_ROUTING_GUIDE.md](DB_ROUTING_GUIDE.md)

---

## 1. Benchmarks & Expected Impact

Internal benchmarks on a typical developer machine (PostgreSQL + Redis running locally) showed the following improvements after enabling indexes, caching, and query tracking (see backend/OPTIMIZATION_SUMMARY.md for full details):

- **Average API latency**
  - Before: ~200–500 ms for common endpoints
  - After: ~50–150 ms (≈70% improvement)
- **Database queries per request**
  - Before: 5–15
  - After: 2–5 (≈60% reduction)
- **Slow queries (> 1s)**
  - Before: 15–20% of queries
  - After: < 5% of queries
- **Concurrent users supported (approx.)**
  - Before: ~50
  - After: 150–250 (≈3–5× increase)

These numbers are environment‑dependent, but they provide a baseline for what you should see when the optimization stack is configured correctly.

---

## 2. Optimization Strategies

The backend uses several layers of optimization that work together:

### 2.1 Database Indexing

- Indexed all frequently queried fields and analytics workloads via `backend/db/migrations/add-performance-indexes.sql`.
- Categories:
  - Single‑column indexes for common filters (userId, tenantId, dates, status flags).
  - Composite indexes for multi‑condition queries (e.g., user + tenant + date-range analytics).
  - Full‑text and JSONB indexes for text search and JSON fields.
- Goal: reduce per‑query latency and make analytics/summary endpoints scale with data size.

### 2.2 Read/Write Routing (DB Routing)

- See [DB_ROUTING_GUIDE.md](DB_ROUTING_GUIDE.md) for full design.
- Reads can be routed to replicas while writes go to the primary database.
- The router is aware of replication lag and consistency windows, so you can:
  - Offload heavy read traffic (dashboards, analytics) to replicas.
  - Keep writes durable and consistent on the primary.

### 2.3 Query Optimization Utilities

- Implemented in `backend/utils/queryOptimization.js`:
  - **Batch loaders** to avoid N+1 query patterns.
  - **Optimized builders + helpers** for common query shapes.
  - **Transaction helpers** for grouped writes.
  - Optional **performance logging** around expensive queries.
- Pattern: wrap your expensive queries with helpers that:
  - Consolidate multiple small queries into a single batched query.
  - Make it cheap to add logging and diagnostics when needed.

### 2.4 Redis Caching Layer

- Core caching service in `backend/services/cacheService.js`.
- Key features:
  - Redis‑backed cache with in‑memory fallback.
  - Standardized **cache keys** via `cacheService.cacheKeys.*`.
  - Helpers like `cacheService.cacheQuery(key, fn, TTL)` for wrapping DB queries.
  - Entity‑specific invalidation helpers (e.g., `invalidateExpenseCache`, `invalidateUserCache`).
- TTL presets (see DATABASE_OPTIMIZATION_GUIDE):
  - `SHORT` (60s) – frequently changing data (recent expenses, dashboards).
  - `MEDIUM` (300s) – moderately changing data.
  - `LONG` (1800s) – rarely changing data.
  - `VERY_LONG` (3600s) – almost static data.
  - `ANALYTICS` (600s) – analytics and summary endpoints.

### 2.5 Route‑Level Cache Middleware

- Implemented in `backend/middleware/cache.js`.
- Common patterns:
  - `routeCache.list(entity, TTL)` – cache list endpoints.
  - `routeCache.single(entity, TTL)` – cache single‑item endpoints.
  - `routeCache.analytics(name, TTL)` – cache analytics endpoints.
- Example (simplified):

  ```js
  router.get(
    '/expenses',
    protect,
    routeCache.list('expenses', cacheService.TTL.SHORT),
    async (req, res) => {
      // handler only runs on cache miss
    }
  );
  ```

### 2.6 Query Performance Tracking

- Implemented in `backend/utils/queryPerformanceTracker.js`.
- Key concepts:
  - `trackQuery(name, metadata?)(asyncFn)` wraps any DB call and records:
    - Duration
    - Whether the result was cached (for cached queries)
    - Metadata such as userId/tenantId, errors, etc.
  - `queryTracker.getStats()` returns aggregate stats:
    - totalQueries, slowQueries, cacheHits, cacheMisses, averageDuration, cacheHitRate.
  - `queryTracker.getSlowestQueries(n)` surfaces your worst offenders.
- Slow‑query thresholds:
  - `> 1s` = slow
  - `> 3s` = very slow (logged at error level)

---

## 3. Caching Implementation in Practice

This section summarizes how to apply the existing caching primitives to new or existing endpoints.

### 3.1 Enabling Caching for GET Endpoints

For list endpoints:

1. Define a cache key using `cacheService.cacheKeys.*` (include user, tenant, and filters).
2. Wrap your DB query with `cacheService.cacheQuery`.
3. Optionally also use `routeCache.list` to short‑circuit at middleware level.

For single‑entity endpoints:

1. Use `routeCache.single('entityName', TTL)` in the route definition.
2. Keep the handler focused on data loading; cache invalidation is centralized in `cacheService` helpers.

### 3.2 Cache Invalidation on Mutations

For `POST`, `PUT`, and `DELETE` endpoints:

- Always invalidate related caches after successfully committing data.
- Pattern (simplified):

  ```js
  const updated = await trackQuery('items.update')(async () => {
    // ...update logic...
  });

  await cacheService.invalidateItemCache(req.user.id, req.user.tenantId, req.params.id);
  ```

This keeps cache hit rates high while ensuring users don’t see stale data after mutations.

### 3.3 TTL Selection Guidelines

- Use **SHORT** TTL for data that changes frequently but can tolerate slight staleness (e.g., recent expenses, live dashboards).
- Use **ANALYTICS** TTL for expensive analytics endpoints that can be cached for a few minutes.
- Use **LONG/VERY_LONG** for reference or configuration data (e.g., categories) that rarely changes.

For detailed checklists and examples, see [backend/OPTIMIZATION_CHECKLIST.md](backend/OPTIMIZATION_CHECKLIST.md).

---

## 4. Monitoring & Observability

The backend exposes dedicated performance monitoring APIs and uses structured logging to help you understand system behavior in real time.

### 4.1 Performance Monitoring API

Routes are defined in `backend/routes/performance.js` and mounted under `/api/performance` (see backend/OPTIMIZATION_SUMMARY.md).

Key endpoints:

- `GET /api/performance/cache-stats` – cache statistics (hits, misses, memory usage where available).
- `GET /api/performance/query-stats` – aggregate query metrics.
- `GET /api/performance/report` – summary report including recommendations from `queryPerformanceTracker.generateReport()`.
- `GET /api/performance/slow-queries` – the slowest recorded queries.
- `GET /api/performance/health` – basic performance/health information.
- `POST /api/performance/clear-cache` – clear all cache entries.

Example usage (local dev):

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:5000/api/performance/report
```

Use these endpoints in staging/production behind authentication and role checks.

### 4.2 Redis Health & Circuit Breaker

- Redis connection management is handled by `backend/config/redis.js`.
- Features:
  - Exponential backoff and retry strategy.
  - Circuit breaker states: `CLOSED`, `OPEN`, `HALF_OPEN` to avoid cascading failures.
  - Graceful degradation to in‑memory rate limiting if Redis is unavailable.
- Helpers:
  - `connectRedis(waitForConnection?)` – initiate connection.
  - `isRedisAvailable()` – quick readiness check.
  - `getConnectionState()` – detailed state for debugging/monitoring.

In production, you should also:

- Monitor Redis instance metrics (CPU, memory, connection counts).
- Alert on:
  - Circuit breaker entering `OPEN` state frequently.
  - Prolonged Redis unavailability.

### 4.3 Logs & Slow Query Alerts

- `backend/utils/logger.js` is used by `queryPerformanceTracker` to log slow queries.
- When a query exceeds `slowQuery` or `verySlowQuery` thresholds, it is logged with:
  - Query name
  - Duration
  - Whether it was cached
  - Optional metadata (e.g., userId, tenantId)
- Recommended practices:
  - Ship logs to a centralized system (e.g., ELK, Loki, or a cloud logging provider).
  - Create alerts on spikes in slow query count or average duration.

---

## 5. How to Run Performance Checks Locally

While the repository does not include a dedicated load‑testing tool, you can perform lightweight checks as follows:

1. **Ensure Redis and Postgres are running**
   - Use `docker-compose up` or your local services.
   - Verify `REDIS_URL` and `DATABASE_URL` are configured in `.env`.

2. **Warm up the cache**
   - Hit common GET endpoints (e.g., expenses list, analytics summary) a few times.
   - Confirm cache behavior via `GET /api/performance/cache-stats`.

3. **Inspect query performance**
   - Call `GET /api/performance/query-stats` and `GET /api/performance/slow-queries`.
   - Look for:
     - High average duration
     - Many slow queries
     - Low cache hit rate

4. **Iterate on optimizations**
   - Apply patterns from DATABASE_OPTIMIZATION_GUIDE and OPTIMIZATION_CHECKLIST.
   - Re‑run the same sequence of requests.
   - Compare stats and logs before/after changes.

For more rigorous load testing, you can integrate tools like k6, Artillery, or Locust outside this repository and point them at your running backend instance.

---

## 6. When Making Performance‑Related Changes

When you introduce new endpoints or refactor existing ones, use this checklist:

- [ ] Are frequently accessed queries indexed appropriately?
- [ ] Are expensive GET endpoints cached with a sensible TTL?
- [ ] Are caches invalidated on mutations that affect the cached data?
- [ ] Is `trackQuery` used for expensive or critical queries?
- [ ] Do performance monitoring endpoints still behave correctly?
- [ ] Have you validated impact using the performance API and logs (before vs. after)?

Following these practices will keep the system responsive and maintain a clear performance story as the product evolves.