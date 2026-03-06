# Tenant-Aware Log Isolation and Access Controls (#629)

This document describes the implementation of tenant-aware log isolation and access controls for the Wealth-Vault application, ensuring strict multi-tenant data separation and preventing cross-tenant log access.

## Overview

The tenant-aware audit isolation system enforces strict tenant-scoped partitions with RBAC-based access policies and row-level security. This prevents cross-tenant log access and data leakage in multi-tenant environments.

## Architecture

### Core Components

1. **Tenant-Aware Audit Service** (`tenantAwareAuditService.js`)
   - Enforces tenant-scoped access controls
   - Manages RLS user contexts
   - Monitors access violations
   - Validates tenant isolation integrity

2. **Database Row-Level Security (RLS)**
   - PostgreSQL RLS policies on audit tables
   - Automatic tenant-based data filtering
   - Session-based user context management

3. **Enhanced RBAC Permissions**
   - Granular audit access controls
   - Tenant-scoped permission validation
   - Access attempt logging and monitoring

4. **Access Control Middleware**
   - Integrated tenant context setting
   - Cross-tenant access prevention
   - Security violation detection

## Row-Level Security Implementation

### RLS Policies

PostgreSQL Row-Level Security policies ensure that users can only access audit data for tenants they belong to:

```sql
-- RLS Policy for audit_logs
CREATE POLICY audit_logs_tenant_isolation ON audit_logs
    FOR ALL USING (
        tenant_id IS NULL OR
        tenant_id IN (
            SELECT tenant_id FROM get_user_tenant_memberships(current_setting('app.current_user_id')::UUID)
        )
    );
```

### User Context Management

The system sets user context for RLS enforcement:

```javascript
// Set user context for RLS
await tenantAwareAuditService.setUserContext(userId, tenantId);

// All subsequent queries are automatically filtered
const logs = await db.select().from(auditLogs).where(...);
```

## Access Control Model

### Permission Hierarchy

```
audit:view              - Basic audit log viewing
├── audit:summary:view  - View tenant audit summaries
├── audit:export        - Export audit logs
├── audit:alert:view    - View security alerts
├── audit:violations:view - View access violations
├── audit:integrity:verify - Verify log integrity
└── audit:integrity:anchor - Anchor Merkle roots externally
```

### Role-Based Access

- **Viewer**: `audit:view`, `audit:summary:view`
- **Manager**: `audit:alert:view` (additional)
- **Admin**: `audit:export`, `audit:integrity:verify`, `audit:violations:view`, `audit:integrity:anchor`
- **Owner**: Full access (`*`)

## API Endpoints

### Tenant-Scoped Audit Access

```http
GET /api/audit/tenants/{tenantId}/logs
```
Query audit logs with tenant isolation (requires `audit:view`)

```http
GET /api/audit/tenants/{tenantId}/summary
```
Get tenant audit summary (requires `audit:summary:view`)

```http
GET /api/audit/tenants/{tenantId}/violations
```
View access violations (requires `audit:violations:view`)

### System-Wide Monitoring

```http
GET /api/audit/system/isolation-check
```
Validate tenant isolation integrity (requires `*`)

```http
GET /api/audit/user/accessible-tenants
```
Get user's accessible tenants for audit operations

## Security Features

### Cross-Tenant Access Prevention

1. **Database-Level RLS**: Automatic query filtering
2. **Application-Level Checks**: Permission validation
3. **Access Logging**: All access attempts are logged
4. **Violation Detection**: Cross-tenant attempts trigger alerts

### Access Violation Monitoring

```javascript
// Detect and log cross-tenant access attempts
await tenantAwareAuditService.validateCrossTenantAccess(
    userId,
    requestedTenantId,
    userAccessibleTenants
);
```

## Database Schema

### RLS Functions

```sql
-- Get user tenant memberships
get_user_tenant_memberships(user_uuid UUID)

-- Set RLS user context
set_audit_user_context(user_uuid UUID)

-- Check tenant audit access
check_tenant_audit_access(user_uuid, tenant_uuid, permissions)

-- Log access attempts
log_audit_access_attempt(user_uuid, tenant_uuid, action, ...)
```

### Security Views

```sql
-- Tenant audit summary
CREATE VIEW tenant_audit_summary AS
SELECT tenant_id, COUNT(*) as total_logs, ...
FROM audit_logs
WHERE tenant_id IS NOT NULL
GROUP BY tenant_id;
```

## Implementation Details

### Middleware Integration

The tenant middleware automatically sets RLS context:

```javascript
// In validateTenantAccess middleware
await tenantAwareAuditService.setUserContext(req.user.id, tenant.id);
```

### Query Scoping

All audit queries are automatically tenant-scoped:

```javascript
// Service method with built-in tenant isolation
const logs = await tenantAwareAuditService.queryTenantAuditLogs(
    userId,
    tenantId,
    filters
);
```

## Testing

Run the tenant-aware audit isolation tests:

```bash
npm test -- tenantAwareAudit.test.js
```

Tests cover:
- RLS policy enforcement
- Cross-tenant access prevention
- Permission-based access control
- Access violation logging
- Tenant isolation integrity validation

## Security Considerations

### Threat Model

The system protects against:
- **Cross-Tenant Data Leakage**: RLS prevents unauthorized access
- **Privilege Escalation**: RBAC enforces permission boundaries
- **Access Pattern Analysis**: All access attempts are logged
- **Data Exfiltration**: Tenant-scoped query filtering

### Compliance

This implementation supports:
- **Multi-Tenant Security**: SOC 2, ISO 27001
- **Data Isolation**: GDPR, CCPA compliance
- **Access Auditing**: SOX, PCI DSS requirements

## Performance

### Indexing Strategy

```sql
CREATE INDEX idx_audit_logs_tenant_actor ON audit_logs(tenant_id, actor_user_id);
CREATE INDEX idx_audit_logs_tenant_category ON audit_logs(tenant_id, category);
CREATE INDEX idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
```

### Query Optimization

- RLS policies use efficient membership lookups
- Tenant-scoped queries leverage composite indexes
- Access control checks are cached per session

## Monitoring & Alerting

### Access Violation Alerts

- Cross-tenant access attempts trigger high-severity alerts
- Suspicious access patterns are flagged
- Audit access logs are continuously monitored

### Isolation Health Checks

```javascript
const status = await tenantAwareAuditService.validateTenantIsolation();
// Returns: isolationIntegrity, orphanedLogs, totalLogs, etc.
```

## Migration

To enable tenant-aware audit isolation:

1. Run the database migration:
   ```bash
   psql -d wealth_vault -f backend/db/migrations/tenant-aware-audit-isolation.sql
   ```

2. Update RBAC permissions in existing roles

3. Restart application servers

4. Existing audit logs remain accessible within tenant boundaries

## Troubleshooting

### Common Issues

1. **RLS Blocking Legitimate Access**: Check user tenant memberships
2. **Performance Degradation**: Review RLS policy efficiency
3. **Access Denied Errors**: Verify RBAC permissions
4. **Missing Audit Logs**: Check tenant isolation policies

### Recovery

1. **Emergency Access**: System admins can bypass RLS for recovery
2. **Policy Updates**: Modify RLS policies without data migration
3. **Access Restoration**: Update tenant memberships as needed

## Future Enhancements

- **Zero-Trust Audit Access**: Additional authentication factors
- **Real-time Access Monitoring**: Streaming violation alerts
- **Audit Data Encryption**: Tenant-specific encryption keys
- **Compliance Reporting**: Automated audit reports per tenant