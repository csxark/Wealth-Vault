# Budget Alert Calculation Race Condition - Issue #552 - Implementation Guide

## Overview

This document describes the comprehensive implementation of budget alert calculation with robust race condition prevention mechanisms. The implementation uses materialized views, optimistic locking, event-driven architecture, and intelligent caching to ensure accurate real-time budget calculations.

**Issue Complexity:** Very High - Event Sourcing, Materialized Views, Distributed Caching

## Problem Statement

Budget alerts were triggering incorrectly due to race conditions in real-time expense aggregation. Multiple concurrent transactions reading/writing expense data could lead to:

1. **Lost Updates**: Multiple threads overwriting each other's calculations
2. **Dirty Reads**: Reading data while it's being modified
3. **Non-Repeatable Reads**: Different values for same calculation
4. **Duplicate Alerts**: Same alert firing multiple times for identical conditions
5. **Stale Cache**: Aggregates not reflecting latest expenses

## Solution Architecture

### 1. Materialized Views with Refresh Triggers

**File**: `backend/services/budgetAlertService.js`

Materialized views are pre-computed aggregates stored in a dedicated table (`budget_aggregates`).

#### Benefits:
- Decouples read operations from write operations
- Allows read-committed isolation for consistent reads
- Can be refreshed asynchronously
- Cached in Redis with TTL

#### Implementation Details:

```javascript
// Computation with READ_COMMITTED isolation
const [aggregate] = await db
  .select({
    totalSpent: sql`COALESCE(SUM(${expenses.amount}), 0) as total_spent`,
    totalCount: sql`COALESCE(COUNT(*), 0) as total_count`,
    // ... other aggregate functions
  })
  .from(expenses)
  .where(
    and(
      eq(expenses.userId, userId),
      eq(expenses.categoryId, categoryId),
      eq(expenses.status, 'completed'),
      gte(expenses.date, periodStart),
      lte(expenses.date, periodEnd)
    )
  );
```

**Isolation Level**: READ_COMMITTED
- Avoids dirty reads
- Allows concurrent transactions
- Lower overhead than SERIALIZABLE

### 2. Optimistic Locking with Version Numbers

**File**: `backend/db/schema.js` (Categories & Budget Aggregates tables)

Version fields prevent lost updates in concurrent scenarios.

#### How it Works:

1. Each aggregate has a `version` field
2. On update, include version in WHERE clause
3. Only proceed if version matches
4. Increment version on success
5. Retry on version mismatch

```sql
UPDATE budget_aggregates
SET 
  total_spent = $1,
  version = version + 1
WHERE 
  id = $2 
  AND version = $3  -- Optimistic lock check
RETURNING *;
```

#### Benefits:
- Detects concurrent modifications
- No locks needed (non-blocking)
- Simple to implement and understand
- Automatic retry capability

### 3. Read-Committed Isolation for Analytics

**File**: `backend/services/budgetAlertService.js`

Ensures analytics queries read consistent data without blocking.

#### Configuration:
- Connection pool default: READ_COMMITTED
- Materialized views computed at this level
- Prevents phantom reads through aggregation

### 4. Cache Aggregates with TTL and Invalidation

**File**: `backend/services/cacheService.js`

Multi-layer caching strategy:

```
Cache Layer 1 (Redis)
    ↓
Cache Layer 2 (In-Memory Fallback)
    ↓
Materialized View (Database)
    ↓
Source Data (Expenses)
```

#### Cache Keys:
```
budget_aggregate:{userId}:{categoryId}:{period}
  - period: daily, weekly, monthly, yearly
  - TTL: 10 minutes
```

#### Invalidation Strategy:
1. **Cache Invalidation**: Delete cache keys on expense modification
2. **Database Marking**: Mark aggregates as stale in DB
3. **Lazy Refresh**: Refresh on next query if marked stale
4. **Scheduled Refresh**: Background job refreshes periodically

#### Implementation:
```javascript
// Invalidate on expense creation
await budgetAlertService.invalidateAggregateCache(userId, categoryId);

// Mark as stale in DB
await db.update(budgetAggregates)
  .set({ isStale: true })
  .where(and(...conditions));

// Lazy refresh on next query
const cached = await cacheService.get(cacheKey);
if (cached && !cached.isStale) {
  return cached;
}
// Recompute if stale
const fresh = await computeBudgetAggregate(...);
```

### 5. Event-Driven Updates Instead of Polling

**File**: `backend/services/budgetAlertEventHandler.js`

Implements reactive pattern using outbox events.

#### Event Flow:

```
Expense.Create Transaction
    ↓
Insert to outbox_events (same transaction)
    ↓
Outbox Dispatcher (background worker)
    ↓
Publish Event
    ↓
Budget Alert Event Handler
    ↓
Invalidate Cache
    ↓
Recompute Aggregate
    ↓
Evaluate Alerts
    ↓
Fire Alert If Threshold Exceeded
```

#### Events Processed:
- `expense.created` - Triggers immediate recalculation
- `expense.updated` - Refreshes aggregate
- `expense.deleted` - Invalidates and recalculates

#### Benefits:
- Real-time alert triggering
- Guaranteed delivery via outbox pattern
- No missed events
- Automatic retries on failure

### 6. Alert Deduplication

**File**: `backend/services/budgetAlertService.js` - `checkAndUpdateDeduplication()`

Prevents duplicate alerts for the same condition.

#### Implementation:

```javascript
// Generate deduplication key
const deduplicationKey = generateDeduplicationKey(
  budgetAlertId,
  currentSpent,
  threshold
);

// Check if already fired recently
const recent = await cacheService.get(deduplicationKey);
if (recent) {
  return false; // Don't fire again
}

// Check database redup entry
const existing = await db.query.alertDeduplication.findFirst({
  where: and(
    eq(alertDeduplication.budgetAlertId, budgetAlertId),
    eq(alertDeduplication.deduplicationKey, deduplicationKey),
    gt(alertDeduplication.expiresAt, new Date())
  ),
});

if (existing && timeSinceLast < windowMs) {
  return false; // Within deduplication window
}
```

#### Deduplication Window:
- Default: 1 hour
- Configurable per alert
- Tracks last fired time and fire count
- Expires old entries automatically

#### Table: `alert_deduplication`
- `deduplication_key`: SHA-256 hash of alert conditions
- `last_fired_at`: When alert last triggered
- `fire_count`: Total times alert has fired
- `expires_at`: When dedup entry expires

## Database Schema

### New Tables Added

#### 1. `budget_alerts`
```sql
CREATE TABLE budget_alerts (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  user_id uuid REFERENCES users(id),
  category_id uuid REFERENCES categories(id),
  alert_type text, -- threshold, daily_limit, weekly_limit, monthly_budget
  threshold numeric(12,2),
  threshold_percentage numeric(5,2),
  scope text, -- daily, weekly, monthly, yearly
  is_active boolean DEFAULT true,
  notification_channels jsonb,
  metadata jsonb,
  created_at timestamp,
  updated_at timestamp
);
```

#### 2. `budget_aggregates` (Materialized View)
```sql
CREATE TABLE budget_aggregates (
  id uuid PRIMARY KEY,
  tenant_id uuid,
  user_id uuid,
  category_id uuid,
  period text, -- daily, weekly, monthly, yearly
  period_start timestamp,
  period_end timestamp,
  total_spent numeric(12,2),
  total_count integer,
  average_transaction numeric(12,2),
  max_transaction numeric(12,2),
  min_transaction numeric(12,2),
  version integer, -- Optimistic locking
  isolation_level text DEFAULT 'read_committed',
  computed_at timestamp,
  refreshed_at timestamp,
  next_refresh_at timestamp,
  is_stale boolean DEFAULT false,
  metadata jsonb,
  created_at timestamp,
  updated_at timestamp
);

-- Unique constraint to prevent duplicates
CREATE UNIQUE INDEX idx_budget_aggregates_unique 
ON budget_aggregates(user_id, category_id, period);
```

#### 3. `alert_deduplication`
```sql
CREATE TABLE alert_deduplication (
  id uuid PRIMARY KEY,
  tenant_id uuid,
  budget_alert_id uuid REFERENCES budget_alerts(id),
  deduplication_key text, -- SHA-256 hash
  last_fired_at timestamp,
  fire_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  deduplication_window_ms integer DEFAULT 3600000, -- 1 hour
  expires_at timestamp,
  metadata jsonb,
  created_at timestamp,
  updated_at timestamp
);

-- Unique constraint on alert + dedup key
CREATE UNIQUE INDEX idx_alert_dedup_key 
ON alert_deduplication(budget_alert_id, deduplication_key);
```

#### 4. Enhanced `categories` Table
```sql
ALTER TABLE categories ADD COLUMN version integer DEFAULT 1;
```

### Indexes for Performance

```sql
-- Budget alerts
CREATE INDEX idx_budget_alerts_user_id ON budget_alerts(user_id);
CREATE INDEX idx_budget_alerts_category_id ON budget_alerts(category_id);
CREATE INDEX idx_budget_alerts_is_active ON budget_alerts(is_active);

-- Budget aggregates
CREATE INDEX idx_budget_aggregates_user_id ON budget_aggregates(user_id);
CREATE INDEX idx_budget_aggregates_is_stale ON budget_aggregates(is_stale);
CREATE INDEX idx_budget_aggregates_next_refresh ON budget_aggregates(next_refresh_at);

-- Alert deduplication
CREATE INDEX idx_alert_deduplication_expires ON alert_deduplication(expires_at);
```

## API Endpoints

### 1. Get Budget Summary
```
GET /api/budget-alerts/summary?categoryId={id}
```

Returns aggregated spending data for multiple periods:
- Daily
- Weekly
- Monthly
- Yearly
- Associated alerts

```json
{
  "daily": {
    "totalSpent": 50,
    "totalCount": 2,
    "avgTransaction": 25
  },
  "weekly": {...},
  "monthly": {...},
  "yearly": {...},
  "alerts": [...]
}
```

### 2. Create Budget Alert
```
POST /api/budget-alerts/create
```

```json
{
  "categoryId": "uuid",
  "alertType": "threshold",
  "threshold": 400,
  "thresholdPercentage": 80,
  "scope": "monthly",
  "channels": ["email", "in-app"]
}
```

### 3. List Budget Alerts
```
GET /api/budget-alerts?categoryId={id}&isActive={bool}
```

### 4. Update Budget Alert
```
PATCH /api/budget-alerts/{alertId}
```

### 5. Delete Budget Alert
```
DELETE /api/budget-alerts/{alertId}
```

## Service Integration

### Expense Creation Flow

```javascript
// In expense creation endpoint:
await db.transaction(async (tx) => {
  // 1. Create expense
  const [expense] = await tx.insert(expenses).values({...});
  
  // 2. Create outbox event (in same transaction)
  await outboxService.createEvent(tx, {
    eventType: 'expense.created',
    payload: {
      userId: expense.userId,
      categoryId: expense.categoryId,
      amount: expense.amount,
      tenantId: expense.tenantId
    }
  });
});

// 3. Background worker (outbox dispatcher)
const event = await pickupEvent();
await budgetAlertEventHandler.handleExpenseEvent(event);

// 4. Event handler:
// - Invalidates cache
// - Recomputes aggregate
// - Evaluates alerts
// - Fires alerts if threshold exceeded
```

## Scheduled Jobs

### 1. Materialized View Refresh
```javascript
// Every 30 minutes
schedule.every('30 minutes', async () => {
  await budgetAlertEventHandler.handleScheduledMaterializationRefresh();
});
```

### 2. Deduplication Cleanup
```javascript
// Every hour
schedule.every('1 hour', async () => {
  await budgetAlertEventHandler.handleDeduplicationCleanup();
});
```

## Performance Characteristics

### CPU Usage
- Redis lookup: O(1) - milliseconds
- Database aggregate computation: O(n) - depends on expense count
- Deduplication check: O(1)
- Alert evaluation: O(m) where m = number of alerts

### Memory Usage
- Cache: ~1KB per user-category-period combination
- In-memory cache: Fallback with garbage collection

### Network Latency
- Cache hits: 1-5ms (Redis)
- Database queries: 10-100ms
- Event processing: 50-200ms

### Concurrency
- No blocking locks
- Optimistic locking handles conflicts
- Deduplication prevents thundering herd

## Testing

### Unit Tests
```
backend/__tests__/budgetAlerts.test.js
```

Covers:
- Materialized view computation
- Cache invalidation and refresh
- Optimistic locking version increments
- Deduplication logic
- Event handling
- Budget summary calculation
- Race condition scenarios
- Concurrent modifications

### Running Tests
```bash
npm test -- budgetAlerts.test.js
```

## Monitoring and Observability

### Logging
- Alert creation/updates
- Aggregate computation
- Cache hits/misses
- Deduplication triggers
- Event processing
- Error conditions

### Metrics to Track
- Alerts fired per hour/day
- Deduplication rate
- Cache hit rate
- Aggregate stale percentage
- Query latency
- Event processing delay

### Sample Metrics
```javascript
logger.info('Budget alert fired', {
  userId,
  categoryId,
  alertId,
  alertType,
  currentSpent,
  threshold,
  deduplicationWindow: 3600000
});

logger.debug('Cache hit', {
  key: cacheKey,
  age: Date.now() - cachedAt
});
```

## Migration Guide

### Step 1: Run Migration
```bash
npm run migrate
# Runs: backend/drizzle/0003_budget_alerts.sql
```

This creates:
- `budget_alerts` table
- `budget_aggregates` table
- `alert_deduplication` table
- `version` column on categories
- Relevant indexes and triggers

### Step 2: Register Routes
```javascript
// In server.js or app setup
import budgetAlertsRouter from './routes/budgetAlerts.js';
app.use('/api/budget-alerts', budgetAlertsRouter);
```

### Step 3: Initialize Scheduled Jobs
```javascript
// In scheduler setup
import { handleScheduledMaterializationRefresh, handleDeduplicationCleanup } 
  from './services/budgetAlertEventHandler.js';

schedule.every('30 minutes', handleScheduledMaterializationRefresh);
schedule.every('1 hour', handleDeduplicationCleanup);
```

### Step 4: Integrate Event Handlers
```javascript
// In outbox dispatcher
import budgetAlertEventHandler from './services/budgetAlertEventHandler.js';

const handleEvent = async (event) => {
  if (event.aggregateType === 'budget_alert') {
    await budgetAlertEventHandler.handleExpenseEvent(event);
  }
};
```

## Troubleshooting

### Alerts not firing
1. Check `budget_alerts` table - ensure alerts are created and active
2. Verify expense creation triggers outbox events
3. Check outbox dispatcher is running
4. Look for deduplication suppressing alerts (check `alert_deduplication`)

### Stale aggregates
1. Run scheduled refresh manually
2. Check `is_stale` flag in `budget_aggregates`
3. Verify cache invalidation on expense create

### Cache inconsistencies
1. Clear Redis cache: `FLUSHALL`
2. Force recomputation: `invalidateAggregateCache(userId, categoryId)`
3. Check cache TTL values

### Performance issues
1. Add indexes if missing
2. Check database connection pool
3. Monitor Redis memory usage
4. Review query plans for aggregate computation

## Future Enhancements

1. **Real-time Streaming**: WebSocket updates when alerts fire
2. **Machine Learning**: Predict future spending based on trends
3. **Custom Alert Formulas**: Allow complex threshold conditions
4. **Alert Fatigue Management**: ML-based deduplication
5. **Multi-currency Support**: Handle currency conversions
6. **Distributed Tracing**: OpenTelemetry integration
7. **Time-series Database**: Move aggregates to InfluxDB/TimescaleDB

## References

- Issue: #552 - Budget Alert Calculation Race Condition
- Outbox Pattern: `backend/services/outboxService.js`
- Cache Service: `backend/services/cacheService.js`
- Drizzle ORM: https://orm.drizzle.team/
- PostgreSQL Isolation Levels: https://www.postgresql.org/docs/current/transaction-iso.html
