# Audit Log Compression and Retention Policy Implementation
## Issue #614: Compliance-Driven Audit Log Management

---

## Executive Summary

This document outlines the implementation of audit log compression, retention, and archival features that address unbounded audit log growth while maintaining regulatory compliance. The solution provides:

- **Time-based retention policies** with configurable tenure periods per compliance framework
- **Automatic compression** of audit logs using multiple algorithms (gzip, zstd, brotli)
- **Cold storage archival** to S3/Azure/GCS with encryption and integrity verification
- **Compliance tracking** aligned with GDPR, HIPAA, SOC2, PCI-DSS, ISO27001
- **Cost optimization** with compression ratio tracking and storage cost estimation
- **Multi-tenant isolation** with per-tenant retention configurations

---

## Architecture Overview

### System Components

```
┌──────────────────────────────────────────────────────────────┐
│                   Retention Policy Management                 │
│  - Policy CRUD                                                │
│  - Compliance framework configuration                         │
│  - Multi-tenant policy isolation                              │
└──────────────┬───────────────────────────────────────────────┘
               │
        ┌──────▼────────┐
        │  Policy Engine │
        │  (Orchestrator)│
        └──────┬────────┘
               │
    ┌──────────┼──────────┬──────────┬──────────┐
    │          │          │          │          │
┌───▼──┐ ┌───▼──┐ ┌────▼──┐ ┌───▼──┐ ┌───▼──┐
│Compr.│ │Archiv│ │Delete │ │Verify│ │Update│
│      │ │      │ │       │ │      │ │Metric│
└──────┘ └──────┘ └───────┘ └──────┘ └──────┘
```

### Data Flow

1. **Policy Application Triggered** → Manual trigger or scheduled job
2. **Compression Phase** → Identify logs older than compression_after_days, apply compression algorithm
3. **Archival Phase** → Create archive batch, upload to cold storage with checksums
4. **Deletion Phase** → Purge logs older than delete_after_days, mark archives for retention
5. **Verification Phase** → Validate archive checksums, update integrity status
6. **Metrics Update** → Record space savings, compression ratios, compliance scoring

---

## Database Schema

### Table: `audit_log_retention_policies`

Defines retention requirements per tenant and compliance framework.

```sql
CREATE TABLE audit_log_retention_policies (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- Policy Definition
    policy_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Retention Timeline (days)
    retention_days INTEGER NOT NULL,           -- Total retention period
    archive_after_days INTEGER NOT NULL,       -- When to move to archive
    delete_after_days INTEGER NOT NULL,        -- When to delete permanently
    
    -- Compliance Configuration
    compliance_framework VARCHAR(50),          -- GDPR, HIPAA, SOC2, PCI-DSS, ISO27001
    regulatory_requirement VARCHAR(100),       -- Specific regulation reference
    min_retention_days INTEGER,                -- Minimum retention mandated
    
    -- Compression Settings
    compression_enabled BOOLEAN DEFAULT true,
    compression_after_days INTEGER DEFAULT 30,
    compression_format VARCHAR(20),            -- gzip, zstd, brotli
    
    -- Archival Settings
    archive_enabled BOOLEAN DEFAULT true,
    archive_destination VARCHAR(100),          -- s3, azure, gcs
    archive_format VARCHAR(50),                -- parquet, avro, jsonl
    
    -- Encryption
    encryption_enabled BOOLEAN DEFAULT true,
    encryption_key_id VARCHAR(255),
    
    -- Exclusions
    excluded_event_types TEXT[],
    excluded_users TEXT[],
    
    -- State
    is_active BOOLEAN DEFAULT true,
    applied_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE (tenant_id, policy_name),
    CHECK (archive_after_days < delete_after_days)
);
```

**Indexes:**
- `(tenant_id) WHERE is_active = true` - Active policies per tenant
- `(compliance_framework)` - Query by compliance requirement
- `(updated_at DESC)` - Recent changes

### Table: `audit_log_archives`

Tracks archive batches with storage location and integrity metadata.

```sql
CREATE TABLE audit_log_archives (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- Archive Batch
    archive_batch_id VARCHAR(100) UNIQUE NOT NULL,
    period VARCHAR(20),                        -- daily, weekly, monthly
    
    -- Source Data
    log_count INTEGER NOT NULL,
    date_range_start TIMESTAMP NOT NULL,
    date_range_end TIMESTAMP NOT NULL,
    
    -- Storage
    storage_path VARCHAR(255),                 -- s3://bucket/path/to/archive
    storage_size NUMERIC(18, 0),               -- Compressed size in bytes
    compression_ratio NUMERIC(5, 2),           -- Compressed / Original ratio
    
    -- Encryption
    encryption_key_id VARCHAR(255),
    encryption_hash VARCHAR(255),
    
    -- Integrity
    checksum_algorithm VARCHAR(20) DEFAULT 'sha256',
    checksum_value VARCHAR(255),
    
    -- Status Tracking
    status VARCHAR(20) DEFAULT 'pending',      -- pending, in-progress, completed, failed, verified, deleted
    progress_percent INTEGER DEFAULT 0,
    error_message TEXT,
    
    -- Deletion Tracking
    deletion_scheduled_at TIMESTAMP,
    deleted_at TIMESTAMP,
    
    -- Retrieval
    retrieval_count INTEGER DEFAULT 0,
    last_retrieved_at TIMESTAMP,
    
    -- Metadata
    archive_reason VARCHAR(100),
    metadata JSONB,                            -- format, destination, encrypted, etc.
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CHECK (date_range_start <= date_range_end)
);
```

**Indexes:**
- `(archive_batch_id) UNIQUE` - Fast batch lookup
- `(tenant_id, period)` - Archives per tenant/period
- `(status)` - Filter by pending/completed/failed
- `(date_range_start, date_range_end)` - Date range queries
- `(deletion_scheduled_at) WHERE deleted_at IS NULL` - Deletion queue

### Table: `audit_log_compression_jobs`

Job queue for compression, archival, deletion, and verification operations.

```sql
CREATE TABLE audit_log_compression_jobs (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- Job Identity
    job_name VARCHAR(100),
    job_type VARCHAR(50),                      -- compress, archive, delete, verify, replicate
    
    -- Target Scope
    date_range_start TIMESTAMP,
    date_range_end TIMESTAMP,
    log_count INTEGER,
    
    -- Execution State
    status VARCHAR(20) DEFAULT 'pending',      -- pending, running, completed, failed, cancelled
    priority INTEGER DEFAULT 50,               -- 0-100, higher = first
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Timing
    processing_started_at TIMESTAMP,
    processing_completed_at TIMESTAMP,
    processing_duration_ms INTEGER,
    
    -- Performance
    logs_processed_per_second NUMERIC(10, 2),
    
    -- Results
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    
    -- References
    archive_id UUID REFERENCES audit_log_archives(id),
    
    -- Error Handling
    error_message TEXT,
    error_details JSONB,
    
    -- Integrity
    integrity_checks_passed BOOLEAN,
    integrity_check_details JSONB,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
- `(tenant_id, status)` - Job queue per tenant
- `(job_type)` - Query by operation type
- `(priority) WHERE status = 'pending'` - Priority queue
- `(processing_started_at DESC) WHERE status IN ('running', 'completed')` - Execution history

### Table: `retention_policy_executions`

Audit trail of policy execution with phase tracking.

```sql
CREATE TABLE retention_policy_executions (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    policy_id UUID NOT NULL REFERENCES audit_log_retention_policies(id),
    
    -- Timing
    execution_started_at TIMESTAMP NOT NULL,
    execution_completed_at TIMESTAMP,
    
    -- Phase Information
    phases JSONB,                              -- [{phase: 'compression', status: 'completed', duration: 1500}]
    
    -- Results
    logs_compressed INTEGER DEFAULT 0,
    logs_archived INTEGER DEFAULT 0,
    logs_deleted_by_age INTEGER DEFAULT 0,
    logs_deleted_by_count INTEGER DEFAULT 0,
    
    -- Impact
    space_saved_bytes NUMERIC(18, 0) DEFAULT 0,
    archive_size_bytes NUMERIC(18, 0) DEFAULT 0,
    
    -- Status
    status VARCHAR(20) DEFAULT 'in-progress',  -- in-progress, completed, failed, partial
    error_message TEXT,
    
    -- Metadata
    execution_notes TEXT,
    operator_notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
- `(tenant_id, policy_id)` - Executions per policy
- `(status)` - Filter by status
- `(execution_started_at DESC)` - Execution history
- `(execution_completed_at DESC) WHERE execution_completed_at IS NOT NULL` - Completed runs

### Table: `audit_log_retention_metrics`

Aggregated metrics for monitoring and compliance reporting.

```sql
CREATE TABLE audit_log_retention_metrics (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    policy_id UUID REFERENCES audit_log_retention_policies(id),
    
    -- Period
    period_type VARCHAR(20) NOT NULL,          -- daily, weekly, monthly
    period_date TIMESTAMP NOT NULL,
    
    -- Log Counts
    total_logs_in_system INTEGER,
    logs_created_this_day INTEGER,
    logs_compressed_this_day INTEGER,
    logs_archived_this_day INTEGER,
    logs_deleted_this_day INTEGER,
    
    -- Storage Metrics
    active_storage_bytes NUMERIC(18, 0),
    compressed_storage_bytes NUMERIC(18, 0),
    archived_storage_bytes NUMERIC(18, 0),
    total_storage_bytes NUMERIC(18, 0),
    
    -- Performance
    avg_compression_ratio NUMERIC(5, 2),
    avg_processing_time_ms NUMERIC(10, 2),
    
    -- Compliance
    policy_compliance_percent INTEGER,
    retention_violation_count INTEGER DEFAULT 0,
    
    -- Costs
    estimated_monthly_storage_cost NUMERIC(10, 2),
    monthly_compression_savings NUMERIC(10, 2),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE (tenant_id, policy_id, period_date, period_type)
);
```

**Indexes:**
- `(tenant_id, period_date DESC)` - Metrics per tenant
- `(policy_compliance_percent)` - Compliance queries

---

## Service Layer

### `auditLogRetentionService.js`

Main orchestrator for retention policy execution and compliance management.

#### Key Functions

**Policy Management:**

```javascript
// Create retention policy with compliance framework
async createRetentionPolicy(tenantId, policyData)
  → Returns: { id, tenant_id, policy_name, compliance_framework, ... }

// Get all policies for tenant
async getTenantRetentionPolicies(tenantId)
  → Returns: Policy[]

// Update policy configuration
async updateRetentionPolicy(tenantId, policyId, updates)
  → Returns: Updated policy

// Get compliance status and archive statistics
async getTenantRetentionStatus(tenantId, policyId)
  → Returns: {
      policyId, policyName, complianceFramework,
      totalArchives, totalLogsArchived, totalStorageBytes,
      avgCompressionRatio, lastExecution, complianceScore
    }
```

**Compression Workflow:**

```javascript
// Main orchestration: compress → archive → delete → verify
async applyRetentionPolicy(tenantId, policyId)
  → Executes all phases, returns execution summary

// Compress logs based on policy settings
async compressAuditLogs(tenantId, policyId)
  → Returns: { jobId, logsCompressed, processingDurationMs, format }

// Archive compressed logs to cold storage
async archiveCompressedLogs(tenantId, policyId)
  → Returns: { archiveId, logsArchived, archiveSizeBytes }

// Delete logs exceeding retention period
async deleteExpiredLogs(tenantId, policyId)
  → Returns: { logsDeleted, spaceSavedBytes }

// Verify archive integrity
async verifyArchiveIntegrity(tenantId, policyId)
  → Returns: { archivesVerified, archivesFailed }
```

**Analytics:**

```javascript
// Get retention metrics (compression, archival, deletion)
async getRetentionMetrics(tenantId, periodType, days)
  → Returns: Metric[]

// Estimate storage costs and compression savings
async estimateStorageCosts(tenantId, policyId)
  → Returns: {
      archivedSizeGB, estimatedOriginalSizeGB,
      compressionSavingsGB, monthlyStorageCost,
      monthlySavings, avgCompressionRatio
    }
```

### Caching Strategy

- **Retention policies**: 1-hour TTL (CACHE_TTL.POLICIES = 3600)
- **Retention metrics**: 30-minute TTL (CACHE_TTL.METRICS = 1800)
- **Archives list**: 2-hour TTL (CACHE_TTL.ARCHIVES = 7200)
- **Invalidation triggers**: Policy creation/update, successful archival, metric updates

### Integration with Outbox Service

Event publishing for asynchronous notification:

```javascript
// Policy lifecycle events
await outboxService.publishEvent('retention-policy-created', { tenantId, policyId, ... })
await outboxService.publishEvent('retention-policy-updated', { tenantId, policyId, ... })

// Workflow events
await outboxService.publishEvent('retention-policy-applied', { tenantId, policyId, success: true, ... })
await outboxService.publishEvent('retention-policy-failed', { tenantId, policyId, error: ... })
```

---

## API Endpoints

### Policy Management

#### `GET /api/audit-retention/policies`
List all retention policies for the tenant.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "tenant_id": "uuid",
      "policy_name": "GDPR 90-Day Retention",
      "compliance_framework": "GDPR",
      "retention_days": 90,
      "archive_after_days": 30,
      "delete_after_days": 90,
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "count": 1
}
```

#### `POST /api/audit-retention/policies`
Create a new retention policy.

**Request:**
```json
{
  "policyName": "GDPR 90-Day Retention",
  "description": "GDPR-compliant retention with S3 archival",
  "retentionDays": 90,
  "archiveAfterDays": 30,
  "deleteAfterDays": 90,
  "complianceFramework": "GDPR",
  "regulatoryRequirement": "GDPR Article 5(1)(e)",
  "compressionFormat": "gzip",
  "archiveDestination": "s3",
  "archiveFormat": "parquet",
  "encryptionEnabled": true
}
```

**Response:**
```json
{
  "success": true,
  "data": { /* created policy */ },
  "message": "Retention policy created successfully"
}
```

#### `PATCH /api/audit-retention/policies/:policyId`
Update a retention policy.

**Request:**
```json
{
  "description": "Updated description",
  "retention_days": 120
}
```

#### `GET /api/audit-retention/policies/:policyId/status`
Get compliance status and archive statistics for a policy.

**Response:**
```json
{
  "success": true,
  "data": {
    "policyId": "uuid",
    "policyName": "GDPR 90-Day Retention",
    "complianceFramework": "GDPR",
    "isActive": true,
    "retentionDays": 90,
    "totalArchives": 12,
    "totalLogsArchived": 1250000,
    "totalStorageBytes": 5242880,
    "avgCompressionRatio": 3.5,
    "lastExecution": {
      "startedAt": "2024-01-15T10:30:00Z",
      "completedAt": "2024-01-15T10:45:00Z",
      "status": "completed",
      "logsProcessed": 125000
    },
    "complianceScore": 98
  }
}
```

### Workflow Operations

#### `POST /api/audit-retention/apply-policy`
Execute complete retention policy workflow (compress → archive → delete → verify).

**Request:**
```json
{
  "policyId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "executionId": "uuid",
    "status": "completed",
    "phases": [
      {
        "phase": "compression",
        "status": "completed",
        "duration": 2500  // milliseconds
      },
      {
        "phase": "archival",
        "status": "completed",
        "duration": 1800
      },
      {
        "phase": "deletion",
        "status": "completed",
        "duration": 1200
      },
      {
        "phase": "verification",
        "status": "completed",
        "duration": 800
      }
    ],
    "summary": {
      "logsCompressed": 125000,
      "logsArchived": 125000,
      "logsDeleted": 45000,
      "spaceSaved": 2621440  // bytes
    }
  }
}
```

#### `POST /api/audit-retention/compress`
Trigger compression job manually.

#### `POST /api/audit-retention/archive`
Trigger archival job manually.

#### `POST /api/audit-retention/verify`
Trigger archive integrity verification.

### Analysis & Reporting

#### `GET /api/audit-retention/metrics?period=daily&days=30`
Get retention metrics for the specified period.

**Query Parameters:**
- `period` - `daily`, `weekly`, or `monthly` (default: `daily`)
- `days` - Number of days to retrieve (1-365, default: 30)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "period_date": "2024-01-15T00:00:00Z",
      "total_logs_in_system": 10000000,
      "logs_created_this_day": 250000,
      "logs_compressed_this_day": 125000,
      "logs_archived_this_day": 45000,
      "logs_deleted_this_day": 10000,
      "total_storage_bytes": 5242880000,
      "avg_compression_ratio": 3.5,
      "policy_compliance_percent": 98
    }
  ]
}
```

#### `GET /api/audit-retention/cost-estimate?policyId=uuid`
Get storage cost and compression savings estimates.

**Response:**
```json
{
  "success": true,
  "data": {
    "archivedSizeGB": "5.00",
    "estimatedOriginalSizeGB": "17.50",
    "compressionSavingsGB": "12.50",
    "monthlyStorageCost": "0.12",
    "monthlySavings": "0.29",
    "archiveCount": 12,
    "avgCompressionRatio": 3.5
  }
}
```

#### `GET /api/audit-retention/archives?status=completed&limit=20&offset=0`
List archives with filtering and pagination.

**Query Parameters:**
- `status` - Filter by status (pending, in-progress, completed, failed, verified, deleted)
- `limit` - Results per page (1-100, default: 20)
- `offset` - Pagination offset (default: 0)

---

## Testing Strategy

### Test Coverage Areas

**1. Policy Management (8 tests)**
- Create retention policies
- Retrieve policies per tenant
- Update policy configurations
- Handle all optional fields

**2. Retention Status (3 tests)**
- Get status for a policy
- Include archive statistics
- Calculate compliance scores

**3. Compression (3 tests)**
- Compress audit logs
- Track job details
- Support multiple compression formats

**4. Archival (4 tests)**
- Archive compressed logs
- Generate batch IDs
- Track storage metrics
- Support different destinations

**5. Deletion (3 tests)**
- Delete expired logs
- Track space savings
- Respect retention periods

**6. Verification (2 tests)**
- Verify archive integrity
- Track verification results

**7. Complete Workflow (4 tests)**
- Execute full workflow (compress → archive → delete → verify)
- Verify phase sequencing
- Track summary statistics
- Handle errors gracefully

**8. Metrics & Analytics (4 tests)**
- Retrieve metrics
- Support different period types
- Filter by date range
- Test caching behavior

**9. Cost Estimation (3 tests)**
- Calculate storage costs
- Compute compression ratios
- Estimate monthly costs

**10. Multi-Tenant (2 tests)**
- Isolate policies per tenant
- Prevent cross-tenant access

**11. Compliance Frameworks (5 tests)**
- GDPR compliance
- HIPAA compliance (7-year retention)
- PCI-DSS compliance
- SOC2 compliance
- ISO27001 compliance

**Total: 42+ test cases**

### Running Tests

```bash
# Run all tests
npm run test

# Run retention-specific tests
npm run test -- auditLogRetention.test.js

# Run with coverage
npm run test:coverage
```

---

## Compliance Frameworks

### GDPR (General Data Protection Regulation)

- **Retention Requirement**: Article 5(1)(e) - Storage Limitation Principle
- **Recommended Duration**: 90-365 days depending on use case
- **Key Feature**: Right to be forgotten support via deletion after retention
- **Schema Support**: `regulatory_requirement`, `excluded_users` for data subject exclusion

### HIPAA (Health Insurance Portability and Accountability Act)

- **Retention Requirement**: 6-7 years for audit logs
- **Recommended Duration**: 2555 days (7 years)
- **Key Feature**: Immutable audit trail (no premature deletion)
- **Schema Support**: `min_retention_days` enforcement

### PCI-DSS (Payment Card Industry Data Security Standard)

- **Retention Requirement**: Requirement 3.2.1 - 1 year minimum
- **Recommended Duration**: 1-3 years
- **Key Feature**: Encryption in archive storage
- **Schema Support**: `encryption_enabled`, `encryption_key_id`

### SOC2 Type II Compliance

- **Retention Requirement**: Continuous monitoring audit trail
- **Recommended Duration**: 1 year minimum
- **Key Feature**: Integrity verification with checksums
- **Schema Support**: `checksum_algorithm`, `integrity_checks_passed`

### ISO27001 (Information Security Management)

- **Retention Requirement**: A.12.4.1 - Event Logging
- **Recommended Duration**: 1 year minimum
- **Key Feature**: Controlled access to audit logs
- **Schema Support**: Multi-tenant isolation enforcement

---

## Performance Considerations

### Compression Algorithms Performance

| Algorithm | Compression Ratio | Speed (MB/s) | Use Case |
|-----------|------------------|--------------|----------|
| gzip      | 3-4x            | 100-200     | Default, balanced |
| zstd      | 3.5-4.5x        | 300-500     | Speed-critical |
| brotli    | 4-5x            | 50-100      | Maximum compression |

### Storage Cost Estimation

**AWS S3 Pricing (Standard):**
- Active storage: $0.023/GB/month
- Archive storage (Glacier): $0.004/GB/month
- Savings with 3.5x compression: ~$0.07/GB/month

**Example:**
- Uncompressed logs: 100 GB/month
- Compressed + archived: 28.6 GB (3.5x ratio)
- Monthly cost reduction: $1.69 → $0.66 (61% savings)

### Database Query Performance

Critical indexes ensure efficient queries:

```sql
-- Fast policy lookup per tenant
CREATE INDEX idx_audit_policies_tenant_active 
    ON audit_log_retention_policies(tenant_id) 
    WHERE is_active = true;

-- Efficient archive status queries
CREATE INDEX idx_audit_archives_status 
    ON audit_log_archives(status);

-- Job priority queue
CREATE INDEX idx_compression_jobs_priority 
    ON audit_log_compression_jobs(priority) 
    WHERE status = 'pending';
```

---

## Deployment and Operations

### Environment Variables

```bash
RETENTION_COMPRESSION_DEFAULT=gzip
RETENTION_SCHEDULE=0 2 * * *              # 2 AM daily
RETENTION_MAX_CONCURRENT_JOBS=5
RETENTION_S3_BUCKET=company-audit-archive
RETENTION_S3_REGION=us-east-1
RETENTION_ENCRYPTION_KMS_KEY=arn:aws:kms:...
```

### Migration Steps

1. **Deploy migration 0016_audit_log_retention.sql** - Creates all tables and indexes
2. **Deploy service layer** - auditLogRetentionService.js
3. **Deploy API routes** - auditRetention.js and register in server.js
4. **Deploy tests** - auditLogRetention.test.js and verify coverage
5. **Create initial policies** - Per-tenant retention policies aligned with compliance
6. **Schedule policy execution** - Via cron job or webhook scheduler

### Monitoring and Alerting

**Key Metrics to Monitor:**

```javascript
// Compression effectiveness
alerts.register('low_compression_ratio', {
  condition: metrics.avgCompressionRatio < 2.0,
  severity: 'warning'
});

// Retention compliance violations
alerts.register('retention_violations', {
  condition: metrics.retentionViolationCount > 0,
  severity: 'critical'
});

// Archival failures
alerts.register('archive_failures', {
  condition: jobStatus.failureCount > 0,
  severity: 'high'
});

// Storage cost overages
alerts.register('storage_cost_spike', {
  condition: metrics.monthlyStorageCost > threshold,
  severity: 'medium'
});
```

### Disaster Recovery

Archive verification ensures recoverability:

```bash
# Test archive retrieval
aws s3 cp s3://audit-archive/tenant-id/archive-batch.parquet.gz .

# Verify checksum
sha256sum archive-batch.parquet.gz

# Decompress and validate
gunzip archive-batch.parquet.gz
```

---

## Security Considerations

### Encryption in Transit and at Rest

- **Archive Upload**: TLS 1.3 to S3
- **Archive Storage**: KMS encryption with per-tenant or customer-managed keys
- **Encryption Keys**: Rotated annually, audit trail maintained
- **Access Control**: IAM policies restrict archive access to backend service

### Audit Trail

Every policy execution recorded with:
- Operator/system identity
- Timestamp and duration
- Logs processed, archived, deleted
- Space saved and cost impact
- Error details if failed
- Integrity verification results

### Data Residency

Multi-region archive support for compliance:

```javascript
// GDPR: Data must stay within EU
archiveDestination: 'az'  // Azure EU regions

// HIPAA: US only
archiveDestination: 's3'  // US regions

// SOC2: Any compliant region
archiveDestination: 'gcs' // Google Cloud
```

---

## Troubleshooting

### Common Issues

#### Archive Integrity Check Fails

**Symptom:** `integrityChecksPassed: false`

**Resolution:**
1. Verify encryption keys are accessible
2. Check storage connectivity to S3/Azure/GCS
3. Re-run verification job after fixing underlying issue
4. Inspect `integrity_check_details` JSONB for specific error

#### Low Compression Ratio

**Symptom:** `avgCompressionRatio < 2.0`

**Resolution:**
1. Check data types in audit logs (structured vs. string-heavy)
2. Try different compression algorithm (zstd, brotli)
3. Verify logs aren't already compressed
4. Consider changing compression format (parquet vs. jsonl)

#### Deletion Fails Due to References

**Symptom:** Foreign key constraint violation during deletion

**Resolution:**
1. Ensure archives are marked as "verified" before deletion
2. Check for active retrieval operations
3. Verify deletion_scheduled_at is properly set
4. Re-run deletion job after cleanup

#### Multi-Tenant Policy Conflicts

**Symptom:** Policies from one tenant affect another

**Resolution:**
1. Verify `tenant_id` check in service layer
2. Confirm database constraints on foreign keys
3. Check API middleware applies correct tenant context
4. Review audit log for unauthorized access attempts

---

## Future Enhancements

1. **Geo-replication** of archives across regions
2. **Incremental archival** instead of batch
3. **Machine learning-based retention optimization** based on access patterns
4. **Real-time compliance dashboard** with automated reporting
5. **Archive recovery SLA** with point-in-time restore
6. **Cost optimization** via Intelligent-Tiering
7. **Blockchain verification** for audit trail immutability

---

## Migration Guide

### From Previous Audit System

1. **Identify existing audit logs** - measure storage usage and age distribution
2. **Create retention policies** - aligned with compliance requirements
3. **Plan migration window** - coordinate with compliance team
4. **Execute initial retention run** - compress old logs (>30 days), archive, verify integrity
5. **Validate data preservation** - spot-check archived logs for completeness
6. **Enable automated scheduling** - daily or weekly retention execution
7. **Monitor compliance** - track metrics and cost savings

### Example Policy Creation

```bash
# GDPR-compliant policy
curl -X POST /api/audit-retention/policies \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "policyName": "GDPR Compliance",
    "retentionDays": 90,
    "archiveAfterDays": 30,
    "deleteAfterDays": 90,
    "complianceFramework": "GDPR"
  }'

# HIPAA-compliant policy (7 years)
curl -X POST /api/audit-retention/policies \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "policyName": "HIPAA Compliance",
    "retentionDays": 2555,
    "archiveAfterDays": 90,
    "deleteAfterDays": 2555,
    "complianceFramework": "HIPAA"
  }'
```

---

## Glossary

- **Compression Ratio**: Original size / Compressed size (higher = better)
- **Archive Batch**: Group of logs archived together in single S3 object
- **Cold Storage**: Long-term archive destination (S3 Glacier, Azure Archive)
- **Checksum**: SHA-256 hash for archive integrity verification
- **Retention Period**: Days before logs must be deleted per policy
- **Policy Execution**: Complete workflow: compress → archive → delete → verify
- **Compliance Score**: Percentage of logs compliant with policy retention rules

---

**Document Version:** 1.0  
**Last Updated:** 2024-01-15  
**Author:** Development Team  
**Status:** Production Ready
