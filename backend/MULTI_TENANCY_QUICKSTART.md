# Multi-Tenancy Quick Start Guide

## Getting Started with Multi-Tenancy

This guide will help you get multi-tenancy working in your Wealth-Vault application.

## Prerequisites

- Node.js 18+
- PostgreSQL 13+
- Environment variables configured (.env)

## Step 1: Install Dependencies

All dependencies should already be in package.json. If you added new ones:

```bash
npm install  # or yarn install
```

Required packages:
- `drizzle-orm`: ^0.45.1
- `postgres`: ^3.4.7
- `jsonwebtoken`: ^9.0.2
- `uuid`: ^10.0.0

## Step 2: Set Up Environment Variables

Ensure your `.env` file has:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/wealth_vault_db

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=7d

# URLs
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3000

# Redis (for sessions)
REDIS_URL=redis://localhost:6379

# Node Environment
NODE_ENV=development
```

## Step 3: Run Database Migration

Execute the multi-tenancy migration:

```bash
# Option 1: Using Drizzle migration
npm run db:migrate

# Option 2: Run migration directly
node -e 'import("./db/migrations/multi-tenancy-support.js").then(m => m.up())'

# Option 3: Test migration (run and rollback)
npm run db:validate
```

You should see:
```
🚀 Starting multi-tenancy migration...
📝 Creating tenant_role enum...
✅ tenant_role enum created
...
✨ Multi-tenancy migration completed successfully!
```

## Step 4: Update Server.js

Add tenant routes to your Express app:

```javascript
import tenantRoutes from './routes/tenants.js';

// Add after other route imports
app.use('/api/tenants', tenantRoutes);
```

## Step 5: Verify Installation

### Check Database Tables

```sql
-- Connect to your database
\d tenants
\d tenant_members

-- Verify columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tenants';
```

### Check Indexes

```sql
SELECT indexname 
FROM pg_indexes 
WHERE tablename IN ('categories', 'expenses', 'goals', 'device_sessions')
ORDER BY indexname;
```

Expected indexes:
- `idx_categories_tenant_id`
- `idx_expenses_tenant_id`
- `idx_goals_tenant_id`
- `idx_tenant_members_tenant_id`
- etc.

## Step 6: Test the Setup

### 1. Start Your Backend Server

```bash
npm run dev  # with nodemon for development
# or
npm start   # for production
```

### 2. Create a Test User

```bash
# Using curl
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@",
    "firstName": "Test",
    "lastName": "User"
  }'
```

<Response example>
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": "uuid-here",
    "email": "test@example.com",
    "firstName": "Test",
    "defaultTenant": {
      "id": "tenant-uuid",
      "name": "Test User's Workspace",
      "slug": "test-users-workspace-abc123"
    }
  },
  "token": "jwt-token-here"
}
```

### 3. Test Tenant Access

```bash
# List user's tenants
curl -X GET http://localhost:3000/api/tenants \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get tenant details
curl -X GET http://localhost:3000/api/tenants/TENANT_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get tenant members
curl -X GET http://localhost:3000/api/tenants/TENANT_ID/members \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 4. Test Data Isolation

Create an expense in the new tenant:

```bash
curl -X POST http://localhost:3000/api/tenants/TENANT_ID/expenses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "100.50",
    "description": "Test Expense",
    "date": "2024-01-15"
  }'
```

List expenses (should show the one you just created):

```bash
curl -X GET http://localhost:3000/api/tenants/TENANT_ID/expenses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Step 7: Run Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test Suite

```bash
npm test -- tenant-isolation.test.js
```

### Run with Coverage

```bash
npm test -- --coverage
```

## Step 8: Test Multi-Tenant Isolation

### Create Second User & Tenant

```bash
# Create another user
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user2@example.com",
    "password": "Test123!@",
    "firstName": "User",
    "lastName": "Two"
  }'
```

### Verify Data Isolation

Try to access User1's tenant with User2's token:

```bash
# This should return 403 Forbidden
curl -X GET http://localhost:3000/api/tenants/USER1_TENANT_ID/expenses \
  -H "Authorization: Bearer USER2_JWT_TOKEN"
```

Expected response:
```json
{
  "success": false,
  "message": "You do not have access to this tenant",
  "code": "FORBIDDEN"
}
```

## Step 9: Update Frontend

### Update API Helper

In your frontend API client:

```javascript
// Before
const getExpenses = async (token) => {
  return fetch('/api/expenses', {
    headers: { Authorization: `Bearer ${token}` }
  });
};

// After
const getExpenses = async (token, tenantId) => {
  return fetch(`/api/tenants/${tenantId}/expenses`, {
    headers: { Authorization: `Bearer ${token}` }
  });
};
```

### Update URL Structure

```javascript
// Before
<Link to="/dashboard">Dashboard</Link>

// After
<Link to={`/tenant/${tenantId}/dashboard`}>Dashboard</Link>
```

### Add Tenant Context to App

```javascript
// In App.tsx or main context
const [currentTenant, setCurrentTenant] = useState(null);

// After login
const { defaultTenant } = loginResponse;
setCurrentTenant(defaultTenant);

// Store in localStorage
localStorage.setItem('currentTenant', JSON.stringify(defaultTenant));
```

## Troubleshooting

### Issue: "Tenant ID is required" Error

**Solution**: Add tenantId to all API calls:
```javascript
// Wrong
GET /api/expenses

// Correct
GET /api/tenants/:tenantId/expenses
// or
GET /api/expenses?tenantId=:tenantId
// or with header
GET /api/expenses
X-Tenant-ID: :tenantId
```

### Issue: "You do not have access to this tenant"

**Solution**: Verify user is member of tenant:
```bash
# Check tenant membership
SELECT * FROM tenant_members 
WHERE tenant_id = 'YOUR_TENANT_ID' 
AND user_id = 'YOUR_USER_ID';
```

### Issue: Migration Failed

**Solution**: Check PostgreSQL connection:
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check if tables exist
psql $DATABASE_URL -c "\dt"
```

### Issue: Query Performance Issues

**Solution**: Verify indexes exist:
```sql
-- Check indexes
\d+ expenses
-- Look for idx_expenses_tenant_id and idx_expenses_tenant_user
```

If missing, run migration again or create manually:
```sql
CREATE INDEX idx_expenses_tenant_id ON expenses(tenant_id);
CREATE INDEX idx_expenses_tenant_user ON expenses(tenant_id, user_id);
```

### Issue: "Invalid tenant ID format"

**Solution**: Ensure you're using valid UUID format:
```javascript
// Wrong - using slug
/api/tenants/my-workspace/expenses

// Correct - using UUID
/api/tenants/550e8400-e29b-41d4-a716-446655440000/expenses
```

## Next Steps

### Immediate (Week 1)
- [x] Run migration
- [x] Verify tables and indexes
- [x] Test basic tenant operations

### Short Term (Week 2-3)
- [ ] Update all API routes with tenant isolation
- [ ] Update frontend URL structure
- [ ] Run comprehensive test suite

### Medium Term (Week 4)
- [ ] Performance optimization
- [ ] Security audit
- [ ] Documentation updates

### Long Term
- [ ] SSO/SAML integration
- [ ] Advanced RBAC
- [ ] Audit logging
- [ ] Multi-region support

## Support & Resources

- **Detailed Guide**: See `MULTI_TENANCY_GUIDE.md`
- **Implementation Checklist**: See `MULTI_TENANCY_CHECKLIST.md`
- **Example Implementation**: See `routes/expenses-example.js`
- **Test Suite Template**: See `__tests__/tenant-isolation.test.js`

## Common Commands

```bash
# Start development server
npm run dev

# Run migrations
npm run db:migrate

# Run tests
npm test

# Check database
npm run db:studio

# Validate schema
npm run db:validate

# Generate new migrations
npm run db:generate

# Push schema to DB
npm run db:push
```

## Database Queries Reference

```sql
-- View all tenants
SELECT id, name, owner_id, tier, status, created_at 
FROM tenants 
ORDER BY created_at DESC;

-- View tenant members
SELECT tm.id, tm.user_id, u.email, tm.role, tm.status, tm.joined_at
FROM tenant_members tm
JOIN users u ON u.id = tm.user_id
WHERE tm.tenant_id = 'TENANT_UUID'
ORDER BY tm.joined_at DESC;

-- Check user's tenants
SELECT t.id, t.name, tm.role
FROM tenant_members tm
JOIN tenants t ON t.id = tm.tenant_id
WHERE tm.user_id = 'USER_UUID' AND tm.status = 'active';

-- View expense distribution by tenant
SELECT 
  t.name,
  COUNT(e.id) as expense_count,
  SUM(e.amount) as total_amount
FROM tenants t
LEFT JOIN expenses e ON e.tenant_id = t.id
GROUP BY t.id, t.name
ORDER BY total_amount DESC;
```

## Performance Tips

1. **Always filter by tenant_id first**
```javascript
// Good - filters most rows first
WHERE tenant_id = '...' AND user_id = '...'

// Less efficient
WHERE user_id = '...' AND tenant_id = '...'
```

2. **Use (tenant_id, user_id) compound indexes**
3. **Paginate large result sets**
4. **Cache tenant settings** (5-10 minute TTL)
5. **Use connection pooling** for database

## Security Checklist

- [ ] All API endpoints validate tenant access
- [ ] No SQL injection vulnerabilities
- [ ] JWT tokens cannot be forged
- [ ] Rate limiting per tenant
- [ ] Audit logging enabled
- [ ] HTTPS enforced in production
- [ ] CORS properly configured
- [ ] Sensitive data encrypted

---

**Last Updated**: January 2026
**Status**: Ready for Development
