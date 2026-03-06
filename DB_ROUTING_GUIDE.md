# PostgreSQL Read/Write Split with Replica-Lag-Aware Routing

## Overview

This implementation provides intelligent database routing with read/write split and replica-lag-aware routing for PostgreSQL.

## Features

✅ **Smart Query Routing**
- Writes → Primary database
- Critical reads → Primary database  
- Non-critical reads → Replica databases (when lag < threshold)
- Post-write reads → Primary (within consistency window)

✅ **Health Monitoring**
- Continuous replica health checks
- Replication lag monitoring
- Automatic failover to primary on replica failure

✅ **Consistency Guarantees**
- Session-based consistency tracking
- Configurable consistency window (default: 5 seconds)
- Automatic primary routing after writes

✅ **Observability**
- Prometheus metrics endpoint
- Real-time routing decisions
- Health status API
- Detailed logging

## Environment Configuration

Add these variables to your `.env` file:

```bash
# Primary database (required)
DATABASE_URL=postgres://user:pass@primary-host:5432/dbname

# Replica databases (comma-separated, optional)
DATABASE_REPLICA_URLS=postgres://user:pass@replica1:5432/dbname,postgres://user:pass@replica2:5432/dbname

# Router configuration
MAX_REPLICA_LAG_MS=1000                    # Maximum acceptable lag (1 second)
CONSISTENCY_WINDOW_MS=5000                 # Post-write consistency window (5 seconds)
DB_HEALTH_CHECK_INTERVAL=30000             # Health check interval (30 seconds)
REPLICA_RETRY_INTERVAL=60000               # Retry unhealthy replicas (1 minute)
PREFER_REPLICAS=true                       # Prefer replicas for reads
DB_CONNECTION_TIMEOUT=5000                 # Connection timeout (5 seconds)
EXPOSE_DB_ROUTING=true                     # Expose routing headers (dev only)
```

## Usage Examples

### 1. Basic Usage - Automatic Routing

The middleware automatically routes queries based on HTTP method:

```javascript
import express from 'express';

const router = express.Router();

// GET requests → Routed to replica (if available and healthy)
router.get('/users', async (req, res) => {
  const users = await req.db.select().from(usersTable);
  res.json(users);
});

// POST/PUT/DELETE → Always routed to primary
router.post('/users', async (req, res) => {
  const newUser = await req.db.insert(usersTable).values(req.body).returning();
  res.json(newUser);
});
```

### 2. Force Primary for Critical Reads

```javascript
router.get('/payment/:id', async (req, res) => {
  // Force primary for financial data
  req.useDBPrimary();
  
  const payment = await req.db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.id, req.params.id));
    
  res.json(payment);
});
```

### 3. Route-Level Primary Enforcement

```javascript
import { forcePrimaryDB } from '../middleware/dbRouting.js';

// All requests to this route use primary
router.get('/admin/reports', forcePrimaryDB(), async (req, res) => {
  const reports = await req.db.select().from(reportsTable);
  res.json(reports);
});
```

### 4. Critical Read Marker

```javascript
import { criticalRead } from '../middleware/dbRouting.js';

// Mark as critical read (uses primary)
router.get('/balance/:userId', criticalRead(), async (req, res) => {
  const balance = await req.db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.userId, req.params.userId));
    
  res.json(balance);
});
```

### 5. Explicit Read/Write Control

```javascript
router.post('/transfer', async (req, res) => {
  // Explicit write - always uses primary
  const writeDb = req.getWriteDB();
  
  const result = await writeDb.transaction(async (tx) => {
    // All operations in transaction use primary
    await tx.update(accountsTable)
      .set({ balance: sql`balance - ${amount}` })
      .where(eq(accountsTable.id, fromAccountId));
      
    await tx.update(accountsTable)
      .set({ balance: sql`balance + ${amount}` })
      .where(eq(accountsTable.id, toAccountId));
      
    return { success: true };
  });
  
  res.json(result);
});

router.get('/recent-transactions', async (req, res) => {
  // Explicit read - can use replica
  const readDb = req.getReadDB();
  
  const transactions = await readDb
    .select()
    .from(transactionsTable)
    .orderBy(desc(transactionsTable.createdAt))
    .limit(10);
    
  res.json(transactions);
});
```

### 6. Consistency Window Example

```javascript
router.post('/create-order', async (req, res) => {
  // Write to primary
  const order = await req.db.insert(ordersTable).values(req.body).returning();
  
  // Consistency window is automatically marked for this session
  res.json(order);
});

router.get('/my-orders', async (req, res) => {
  // If called within 5 seconds after write, this will route to primary
  // After 5 seconds, it can use replica
  const orders = await req.db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.userId, req.user.id));
    
  res.json(orders);
});
```

## Monitoring & Health

### Health Check Endpoint

```bash
# Public health check
curl http://localhost:5000/api/db-router/health

# Response
{
  "success": true,
  "status": "healthy",
  "primary": true,
  "replicas": {
    "healthy": 2,
    "total": 2
  },
  "timestamp": "2026-03-01T10:30:00.000Z"
}
```

### Router Status (Admin)

```bash
curl -H "Authorization: Bearer <admin-token>" \
  http://localhost:5000/api/db-router/status

# Response
{
  "success": true,
  "data": {
    "primary": {
      "connected": true,
      "available": true
    },
    "replicas": [
      {
        "index": 0,
        "healthy": true,
        "lag": 234,
        "lastCheck": 1709287834567,
        "errors": 0,
        "url": "postgres://****@replica1:5432/dbname"
      }
    ],
    "config": {
      "maxReplicaLag": 1000,
      "consistencyWindowMs": 5000,
      "healthCheckInterval": 30000
    },
    "metrics": { ... }
  }
}
```

### Metrics (Admin)

```bash
curl -H "Authorization: Bearer <admin-token>" \
  http://localhost:5000/api/db-router/metrics

# Response
{
  "success": true,
  "data": {
    "primaryReads": 1234,
    "primaryWrites": 567,
    "replicaReads": 8901,
    "failovers": 2,
    "lagViolations": 5,
    "consistencyEnforcements": 234,
    "healthCheckFailures": 1,
    "totalReads": 10135,
    "replicaReadPercentage": 87.82,
    "activeReplicas": 2,
    "totalReplicas": 2
  }
}
```

### Prometheus Metrics

```bash
curl http://localhost:5000/api/db-router/metrics/prometheus

# Output (Prometheus format)
# HELP db_router_primary_reads_total Total number of reads routed to primary
# TYPE db_router_primary_reads_total counter
db_router_primary_reads_total 1234

# HELP db_router_replica_reads_total Total number of reads routed to replicas
# TYPE db_router_replica_reads_total counter
db_router_replica_reads_total 8901

# HELP db_router_replica_lag_ms Replication lag in milliseconds
# TYPE db_router_replica_lag_ms gauge
db_router_replica_lag_ms{replica="0"} 234
```

### Force Health Check (Admin)

```bash
curl -X POST \
  -H "Authorization: Bearer <admin-token>" \
  http://localhost:5000/api/db-router/health-check
```

## Response Headers (Development)

When `EXPOSE_DB_ROUTING=true`, responses include routing metadata:

```
X-DB-Target: replica-0
X-DB-Reason: replica-available
X-DB-Replica-Lag: 234
```

## Best Practices

### 1. **Financial/Critical Data**
Always use primary for financial transactions:

```javascript
router.post('/payment', forcePrimaryDB(), async (req, res) => {
  // Payment processing uses primary
});
```

### 2. **Analytics/Reporting**
Can tolerate slight lag, perfect for replicas:

```javascript
router.get('/analytics/dashboard', async (req, res) => {
  // Dashboard data can use replica (default behavior)
  const stats = await req.db.select().from(analyticsTable);
  res.json(stats);
});
```

### 3. **Post-Write Reads**
Automatic consistency is handled, but you can force primary:

```javascript
router.post('/create-post', async (req, res) => {
  const post = await req.db.insert(postsTable).values(req.body).returning();
  
  // Immediate redirect to view post
  // Automatically uses primary within consistency window
  res.redirect(`/posts/${post.id}`);
});
```

### 4. **Background Jobs**
Can use replicas when appropriate:

```javascript
async function generateMonthlyReport() {
  const readDb = req.getReadDB();
  
  // Report generation can use replica
  const data = await readDb.select().from(transactionsTable);
  // Process data...
}
```

## Failover Behavior

When replica becomes unhealthy:
1. Health check detects failure
2. Replica marked as unhealthy
3. New reads automatically route to primary
4. Periodic retry attempts on unhealthy replica
5. Auto-recovery when replica becomes healthy

## Performance Impact

**Benefits:**
- 70-90% read offload to replicas
- Reduced primary database load
- Better horizontal scalability
- Improved query performance

**Overhead:**
- ~5ms per health check (every 30s)
- Minimal routing decision overhead (<1ms)
- In-memory consistency tracking (negligible)

## Troubleshooting

### High Lag Violations

```bash
# Check replica lag
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/db-router/replicas

# Adjust threshold
MAX_REPLICA_LAG_MS=2000  # Increase to 2 seconds
```

### All Reads Going to Primary

Check:
1. Are replicas connected? Check logs
2. Is lag too high? Check metrics
3. Is `PREFER_REPLICAS=false`? 
4. Recent writes triggering consistency window?

### Connection Failures

```bash
# Check logs
docker logs wealth-vault-backend

# Verify connection strings
DATABASE_REPLICA_URLS=postgres://...

# Test connection manually
psql $DATABASE_URL
```

## Testing

### Run Tests

```bash
# Unit tests
npm test backend/__tests__/dbRouter.test.js

# Integration tests
npm test backend/__tests__/integration/dbRouting.test.js

# Load testing
npm run test:load -- --scenario db-routing
```

### Manual Testing

```bash
# 1. Start with replicas
docker-compose up -d postgres-primary postgres-replica1

# 2. Make some reads
curl http://localhost:5000/api/users

# 3. Check metrics
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/db-router/metrics

# 4. Simulate replica failure
docker-compose stop postgres-replica1

# 5. Verify failover
curl http://localhost:5000/api/users
# Should still work (failed to primary)
```

## Migration Guide

### From Single Database

1. **Add replica URL**
```bash
DATABASE_REPLICA_URLS=postgres://user:pass@replica:5432/dbname
```

2. **Restart application**
```bash
npm restart
```

3. **Verify routing**
```bash
curl http://localhost:5000/api/db-router/status
```

### Update Existing Code

No code changes required! The middleware automatically handles routing.

**Optional optimizations:**

```javascript
// Before (works but not optimal)
router.get('/data', async (req, res) => {
  const data = await db.select().from(table);  // Uses global db
  res.json(data);
});

// After (optimal)
router.get('/data', async (req, res) => {
  const data = await req.db.select().from(table);  // Uses routed db
  res.json(data);
});
```

## Limitations

- In-memory consistency tracking (use Redis for multi-instance)
- PostgreSQL only (MySQL/MongoDB support planned)
- Requires PostgreSQL streaming replication
- Session tracking requires stable session IDs

## Future Enhancements

- [ ] Redis-based consistency tracking
- [ ] Weighted load balancing across replicas
- [ ] Geo-aware replica selection
- [ ] Query-level routing hints
- [ ] Automatic read scaling based on load
- [ ] Support for read-only transactions
- [ ] Connection pooling optimization

## Support

For issues or questions:
- GitHub Issues: [Create Issue](https://github.com/your-repo/issues)
- Documentation: [Docs](https://docs.your-project.com)
- Slack: #database-team
