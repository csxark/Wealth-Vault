# Multi-Tenancy Implementation Guide

## Overview
This document provides guidelines for implementing multi-tenancy across all API routes in the Wealth-Vault application.

## Architecture Overview

### Key Components
1. **Tenants Table**: Stores organization/workspace information
2. **Tenant Members Table**: Manages team membership and role-based access control
3. **Tenant Middleware**: Validates tenant access and enforces data isolation
4. **Tenant Service**: Business logic for tenant operations

### Data Isolation Strategy
- **Row-Level Security**: All tables with user data include `tenant_id` foreign key
- **Mandatory Tenant Context**: Every request must include tenant ID and verify user membership
- **Role-Based Permissions**: Control what actions users can perform based on their role

## Implementation Steps

### Step 1: Update Route Registration
In `server.js`, register the new tenant routes:

```javascript
import tenantRoutes from './routes/tenants.js';

// Add after other routes
app.use('/api/tenants', tenantRoutes);
```

### Step 2: Update Existing Routes with Tenant Isolation

#### Template for updating routes:

```javascript
// BEFORE (without tenant isolation)
router.get('/expenses', protect, async (req, res) => {
  const expenses = await db.select().from(expenses)
    .where(eq(expenses.userId, req.user.id));
  // ... rest of handler
});

// AFTER (with tenant isolation)
router.get('/expenses', protect, validateTenantAccess, async (req, res) => {
  const expenses = await db.select().from(expenses)
    .where(
      and(
        eq(expenses.tenantId, req.tenant.id),
        eq(expenses.userId, req.user.id)
      )
    );
  // ... rest of handler
});
```

### Step 3: Key Patterns

#### Pattern 1: Protected tenant-scoped query
```javascript
import { validateTenantAccess } from '../middleware/tenantMiddleware.js';

router.get('/resource', protect, validateTenantAccess, async (req, res) => {
  const results = await db
    .select()
    .from(table)
    .where(eq(table.tenantId, req.tenant.id));
  // Process results...
});
```

#### Pattern 2: Admin-only operations
```javascript
import { requireTenantRole } from '../middleware/tenantMiddleware.js';

router.post('/admin-action', 
  protect, 
  validateTenantAccess, 
  requireTenantRole(['owner', 'admin']), 
  async (req, res) => {
    // Only owners and admins can perform this action
});
```

#### Pattern 3: Verify ownership before deletion
```javascript
router.delete('/:id', protect, validateTenantAccess, async (req, res) => {
  const [resource] = await db.select()
    .from(table)
    .where(
      and(
        eq(table.id, req.params.id),
        eq(table.tenantId, req.tenant.id),
        eq(table.userId, req.user.id)
      )
    );
  
  if (!resource) {
    return res.status(404).json({ success: false, message: 'Resource not found' });
  }
  
  // Delete resource...
});
```

#### Pattern 4: Bulk operations with tenant validation
```javascript
router.post('/bulk-delete', protect, validateTenantAccess, async (req, res) => {
  const { ids } = req.body;
  
  // Verify all items belong to tenant before deletion
  const items = await db.select()
    .from(table)
    .where(
      and(
        inArray(table.id, ids),
        eq(table.tenantId, req.tenant.id) // CRITICAL: Always include tenant check
      )
    );
  
  if (items.length !== ids.length) {
    return res.status(403).json({ 
      success: false, 
      message: 'Some items do not belong to your tenant' 
    });
  }
  
  // Proceed with deletion...
});
```

## Routes to Update

### Priority 1 (Critical - User Data)
- [ ] `routes/expenses.js` - All expense operations
- [ ] `routes/categories.js` - All category operations
- [ ] `routes/goals.js` - All goal operations
- [ ] `routes/users.js` - Profile, preferences, settings

### Priority 2 (Important - Analytics)
- [ ] `routes/analytics.js` - All analytics endpoints
- [ ] `routes/health.js` - Health check (may need tenant context)

### Priority 3 (Secondary)
- [ ] `routes/auth.js` - Update signup to create default tenant
- [ ] `routes/gemini.js` - AI endpoints (enforce tenant data access)

## Authentication Context Update

### User Signup Flow
When a new user signs up, automatically create a default tenant:

```javascript
// In auth.js signup handler
import { createDefaultTenant } from '../services/tenantService.js';

// After user is created:
const defaultTenant = await createDefaultTenant(user.id);

// Add default tenant ID to response for client
return res.status(201).json({
  success: true,
  data: {
    user: { /* ... */ },
    defaultTenant: {
      id: defaultTenant.id,
      name: defaultTenant.name,
      slug: defaultTenant.slug
    }
  }
});
```

### JWT Token Enhancement
JWT tokens should now include tenant context:

```javascript
// In token generation service
const tokenPayload = {
  id: user.id,
  email: user.email,
  sessionId: sessionId,
  // Add primary tenant context for convenience
  tenantId: primaryTenant?.id
};

const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRE || '7d'
});
```

## Client-Side Changes

### Required Headers
Clients must now include tenant context in requests:

```javascript
// Option 1: URL parameter
GET /api/expenses?tenantId=uuid

// Option 2: Path parameter (recommended)
GET /api/tenants/uuid/expenses

// Option 3: Header (for client libraries)
GET /api/expenses
X-Tenant-ID: uuid
```

### Frontend URL Structure
Update routes to include tenant in URLs:

```javascript
// Before
/dashboard
/expenses
/categories

// After
/tenant/uuid/dashboard
/tenant/uuid/expenses
/tenant/uuid/categories
```

## Testing Multi-Tenancy

### Unit Test Template
```javascript
describe('Tenant Isolation', () => {
  let tenant1, tenant2, user1, user2;

  beforeEach(async () => {
    // Create two separate tenants with different users
    user1 = await createUser({ email: 'user1@example.com' });
    user2 = await createUser({ email: 'user2@example.com' });
    tenant1 = await createTenant({ ownerId: user1.id });
    tenant2 = await createTenant({ ownerId: user2.id });
  });

  it('should not allow user1 to access tenant2 data', async () => {
    // Create expense in tenant2
    const expense = await createExpense({
      tenantId: tenant2.id,
      userId: user2.id,
      amount: 100
    });

    // Try to access as user1
    const token = generateToken(user1.id);
    const res = await request(app)
      .get(`/api/tenants/${tenant2.id}/expenses`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('should allow users to access only their tenant data', async () => {
    // Create expense in tenant1
    const expense = await createExpense({
      tenantId: tenant1.id,
      userId: user1.id,
      amount: 100
    });

    // Access as user1 in tenant1
    const token = generateToken(user1.id);
    const res = await request(app)
      .get(`/api/tenants/${tenant1.id}/expenses`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});
```

## Security Considerations

### Critical Checks
1. **Always validate tenant ID** - Never trust client-provided tenant ID alone
2. **Verify group membership** - Check `tenant_members` table before any operation
3. **Enforce on all layers** - Database, middleware, and service layer
4. **Prevent cross-tenant leaks** - Use indexes on `(tenant_id, user_id)` for performance
5. **Audit tenant changes** - Log all tenant membership and role changes

### Query Patterns to Avoid
```javascript
// ❌ WRONG - Missing tenant check
const expenses = await db.select().from(expenses)
  .where(eq(expenses.userId, req.user.id));

// ❌ WRONG - Checking only user ID
const category = await db.select().from(categories)
  .where(eq(categories.id, req.params.id));

// ✅ CORRECT - Include tenant filter
const expenses = await db.select().from(expenses)
  .where(
    and(
      eq(expenses.tenantId, req.tenant.id),
      eq(expenses.userId, req.user.id)
    )
  );
```

## Performance Optimization

### Indexes
The migration creates these indexes automatically:
```sql
CREATE INDEX idx_expenses_tenant_id ON expenses(tenant_id);
CREATE INDEX idx_expenses_tenant_user ON expenses(tenant_id, user_id);
CREATE INDEX idx_categories_tenant_id ON categories(tenant_id);
CREATE INDEX idx_goals_tenant_id ON goals(tenant_id);
```

### Query Optimization Tips
1. Always filter by tenant_id first (most selective)
2. Use compound indexes on (tenant_id, user_id)
3. Add pagination for tenant queries
4. Consider caching tenant settings

## Rollout Strategy

### Phase 1: Foundation (Completed)
- [x] Schema changes
- [x] Migration script
- [x] Tenant service
- [x] Tenant middleware
- [x] Tenant routes

### Phase 2: Integration
- [ ] Update auth routes for default tenant creation
- [ ] Update all data endpoints with tenant isolation
- [ ] Update frontend to include tenant in URLs
- [ ] Add tenant context to all API calls

### Phase 3: Testing & Hardening
- [ ] Write comprehensive tests
- [ ] Security audit
- [ ] Performance testing
- [ ] User acceptance testing

### Phase 4: Monitoring
- [ ] Set up tenant data access logging
- [ ] Monitor for unauthorized access attempts
- [ ] Track tenant performance metrics
- [ ] Implement alerting for security events

## Troubleshooting

### Common Issues

**Issue**: "Tenant ID is required" error on every request
**Solution**: Ensure frontend is passing tenantId in URL or headers

**Issue**: Users can't see their data
**Solution**: Check that default tenant was created in signup and user is member

**Issue**: Cross-tenant data leak
**Solution**: Review all query WHERE clauses to ensure tenant_id filter is present

**Issue**: Permission denied errors
**Solution**: Verify user membership in `tenant_members` table

## References

- [Tenant Middleware](../middleware/tenantMiddleware.js)
- [Tenant Service](../services/tenantService.js)
- [Tenant Routes](../routes/tenants.js)
- [Database Schema](../db/schema.js)
- [Migration Script](../db/migrations/multi-tenancy-support.js)
