# Configurable Per-Tenant Retention Policies Implementation
## Issue #647

---

## Executive Summary

This implementation provides configurable retention policies for different tenants, allowing varying compliance retention durations (e.g., 30/90/365 days) with automated purge enforcement. The solution supports both global retention policies with tenant-specific overrides and fully tenant-isolated configurations.

---

## Architecture Overview

### System Components

```
┌──────────────────────────────────────────────────────────────┐
│              Tenant Retention Policy Management               │
│  - Global policy templates                                    │
│  - Tenant-specific overrides                                  │
│  - Compliance framework mapping                               │
│  - Automated policy application                               │
└─────────────────────┬────────────────────────────────────────┘
                      │
           ┌──────────▼──────────┐
           │   Policy Engine     │
           │   (Scheduler)       │
           └──────────┬──────────┘
                      │
           ┌──────────▼──────────┐
           │   Retention Jobs    │
           │  - Audit logs       │
           │  - Application logs │
           │  - System logs      │
           └──────────┬──────────┘
                      │
           ┌──────────▼──────────┐
           │   Purge Engine      │
           │  - Compression      │
           │  - Archival         │
           │  - Deletion         │
           └─────────────────────┘
```

### Data Flow

1. **Policy Configuration** → Admin sets global policies or tenant overrides
2. **Policy Resolution** → System determines effective policy per tenant
3. **Scheduled Execution** → Jobs run retention logic based on resolved policies
4. **Automated Purge** → Old data compressed, archived, or deleted
5. **Compliance Reporting** → Audit trails maintained for regulatory requirements

---

## Database Schema

### tenant_retention_policies

```sql
CREATE TABLE tenant_retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    policy_name VARCHAR(100) NOT NULL,
    description TEXT,
    retention_days INTEGER NOT NULL CHECK (retention_days >= 30),
    archive_after_days INTEGER CHECK (archive_after_days < retention_days),
    delete_after_days INTEGER CHECK (delete_after_days <= retention_days),
    compliance_framework VARCHAR(50),
    regulatory_requirement TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Indexes
CREATE INDEX idx_tenant_retention_policies_tenant ON tenant_retention_policies(tenant_id);
CREATE INDEX idx_tenant_retention_policies_active ON tenant_retention_policies(tenant_id, is_active);
```

### global_retention_policies

```sql
CREATE TABLE global_retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_name VARCHAR(100) NOT NULL,
    description TEXT,
    retention_days INTEGER NOT NULL CHECK (retention_days >= 30),
    archive_after_days INTEGER,
    delete_after_days INTEGER,
    compliance_framework VARCHAR(50),
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## API Endpoints

### GET /api/retention/policies
Get retention policies for the tenant (effective policies after applying overrides)

### POST /api/retention/policies
Create a tenant-specific retention policy

### PUT /api/retention/policies/:id
Update a tenant-specific retention policy

### DELETE /api/retention/policies/:id
Deactivate a tenant-specific retention policy

### GET /api/retention/global-policies
Get global retention policy templates (admin only)

### POST /api/retention/global-policies
Create a global retention policy template (admin only)

---

## Service Implementation

### RetentionPolicyService

```javascript
class RetentionPolicyService {
    // Resolve effective policy for a tenant
    async getEffectivePolicy(tenantId) {
        // Check for tenant-specific policy first
        let policy = await this.getTenantPolicy(tenantId);
        
        // Fall back to global default if no tenant policy
        if (!policy) {
            policy = await this.getGlobalDefaultPolicy();
        }
        
        return policy;
    }
    
    // Apply retention logic
    async applyRetention(tenantId) {
        const policy = await this.getEffectivePolicy(tenantId);
        
        // Compress old logs
        await this.compressLogs(tenantId, policy.archiveAfterDays);
        
        // Archive logs
        await this.archiveLogs(tenantId, policy.archiveAfterDays);
        
        // Delete expired logs
        await this.deleteLogs(tenantId, policy.deleteAfterDays);
    }
}
```

---

## Scheduled Jobs

### RetentionCleanupJob

- Runs daily at 2 AM
- Processes all tenants with active retention policies
- Handles compression, archival, and deletion
- Logs all operations for audit compliance

### RetentionMonitoringJob

- Runs hourly
- Monitors retention job health
- Alerts on failures or performance issues
- Generates compliance reports

---

## Configuration Options

### Policy Parameters

- **retention_days**: Total days to retain data (30-2555 days)
- **archive_after_days**: Days after which to archive data
- **delete_after_days**: Days after which to permanently delete data
- **compliance_framework**: GDPR, HIPAA, SOC2, PCI-DSS, etc.
- **regulatory_requirement**: Specific regulatory text or reference

### Automation Settings

- **auto_compress**: Enable automatic compression
- **auto_archive**: Enable automatic archival
- **auto_delete**: Enable automatic deletion
- **compression_format**: gzip, zstd, brotli
- **archive_destination**: s3, azure, gcs

---

## Security Considerations

### Multi-Tenant Isolation

- Policies are strictly tenant-scoped
- No cross-tenant data access
- Audit logging for all policy changes

### Compliance Tracking

- All retention operations are logged
- Compliance reports generated monthly
- Data lineage maintained for regulatory audits

---

## Monitoring and Alerting

### Metrics Collected

- Retention job execution time
- Data compression ratios
- Archive success/failure rates
- Storage cost savings
- Compliance violation alerts

### Alerts

- Retention job failures
- Storage threshold exceeded
- Compliance deadline approaching
- Manual intervention required

---

## Testing Strategy

### Unit Tests

- Policy resolution logic
- Retention calculation algorithms
- Compression and archival functions

### Integration Tests

- End-to-end retention workflows
- Multi-tenant policy isolation
- Compliance reporting accuracy

### Performance Tests

- Large dataset retention operations
- Concurrent tenant processing
- Storage I/O optimization

---

## Deployment Checklist

- [ ] Database migrations applied
- [ ] Service configurations updated
- [ ] Scheduled jobs enabled
- [ ] Monitoring dashboards configured
- [ ] Admin training completed
- [ ] Compliance documentation updated

---

## Future Enhancements

- Advanced compression algorithms
- Multi-region archival
- AI-powered retention optimization
- Real-time compliance monitoring
- Integration with external audit systems</content>
<parameter name="filePath">c:\Users\Gupta\Downloads\Wealth-Vault\ISSUE_647_PER_TENANT_RETENTION_POLICIES.md