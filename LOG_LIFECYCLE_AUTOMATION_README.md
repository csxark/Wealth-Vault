# Log Lifecycle Automation with Cold Storage Migration (#633)

## Overview

The Log Lifecycle Automation system automatically manages audit log storage across multiple tiers based on configurable age thresholds. It migrates logs from hot storage (frequent access) to warm storage (occasional access) to cold storage (archival), reducing operational overhead and optimizing storage costs.

## Architecture

### Core Components

1. **Log Lifecycle Automation Service** (`logLifecycleAutomation.js`)
   - Main service that orchestrates automated log migrations
   - Runs scheduled migration cycles based on lifecycle policies
   - Monitors storage usage and sends alerts for threshold violations

2. **Log Lifecycle Job** (`logLifecycleJob.js`)
   - Scheduled job that executes the lifecycle automation
   - Runs migration and monitoring cycles at configured intervals
   - Provides health monitoring and status reporting

3. **Lifecycle Policies**
   - Configurable rules defining migration thresholds and behavior
   - Per-tenant policies with customizable age thresholds
   - Support for enabling/disabling automation and monitoring

4. **Storage Locations**
   - Definition of storage tiers (hot, warm, cold)
   - Support for different storage types (database, cloud storage)
   - Cost tracking and capacity monitoring

### Storage Tiers

- **Hot Storage**: Recent logs with frequent access patterns
  - Full indexing and fast queries
  - No compression (immediate access needed)
  - Highest storage cost

- **Warm Storage**: Logs accessed occasionally
  - Partial indexing for common queries
  - Light compression (gzip)
  - Medium storage cost

- **Cold Storage**: Archived logs with rare access
  - Minimal indexing (metadata only)
  - High compression (lz4, archival formats)
  - Lowest storage cost

## Database Schema

The lifecycle automation uses the following database tables:

- `log_lifecycle_policies` - Configuration for lifecycle management per tenant
- `log_storage_locations` - Definition of storage tiers and locations
- `log_migration_history` - Audit trail of all migration operations
- `log_lifecycle_monitoring` - Daily monitoring statistics and metrics

### Extended Audit Logs

The `audit_logs` table is extended with lifecycle fields:

```sql
ALTER TABLE audit_logs
ADD COLUMN storage_tier log_storage_tier DEFAULT 'hot',
ADD COLUMN migrated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN lifecycle_policy_id UUID REFERENCES log_lifecycle_policies(id);
```

## Features

### Automated Migration

- **Age-Based Migration**: Automatically moves logs between tiers based on age
- **Configurable Thresholds**: Customizable days for hot→warm and warm→cold transitions
- **Batch Processing**: Processes migrations in configurable batch sizes
- **Error Handling**: Robust error handling with retry logic and failure tracking

### Multi-Tenant Support

- **Tenant Isolation**: Separate policies and storage for each tenant
- **RLS Policies**: Row-level security ensures tenant data isolation
- **Per-Tenant Monitoring**: Individual monitoring and alerting per tenant

### Storage Optimization

- **Cost Tracking**: Tracks storage costs per tier and location
- **Capacity Monitoring**: Monitors storage usage against configured limits
- **Compression Integration**: Works with existing compression services

### Monitoring and Alerting

- **Storage Threshold Alerts**: Alerts when storage usage exceeds thresholds
- **Migration Monitoring**: Tracks migration success/failure rates
- **Performance Metrics**: Monitors migration duration and throughput
- **Health Checks**: Comprehensive service health monitoring

## Configuration

### Lifecycle Policy Configuration

```javascript
const policy = {
    policyName: 'Default Lifecycle Policy',
    hotToWarmThreshold: 30,        // Days: hot → warm
    warmToColdThreshold: 90,       // Days: warm → cold (60 days in warm)
    coldRetentionDays: 365,        // Days: total retention
    autoMigrationEnabled: true,
    migrationBatchSize: 1000,
    enableMonitoring: true,
    storageThresholdPercent: 80.0
};
```

### Storage Location Configuration

```javascript
const location = {
    storageTier: 'cold',
    storageType: 's3',           // 'database', 's3', 'azure_blob', 'gcs'
    bucketName: 'wealth-vault-cold-logs',
    region: 'us-west-2',
    maxSizeGb: 1000,
    estimatedCostPerGb: 0.02
};
```

### Service Configuration

```javascript
const config = {
    migrationBatchSize: 1000,
    migrationIntervalMinutes: 60,    // Run every hour
    maxConcurrentMigrations: 3,
    enableMonitoring: true,
    enableAlerts: true,
    storageThresholdAlertPercent: 80.0
};
```

## Usage

### Starting the Lifecycle Automation

```javascript
import LogLifecycleAutomation from './services/logLifecycleAutomation.js';

// Initialize and start automated lifecycle management
const lifecycle = new LogLifecycleAutomation();
await lifecycle.initialize();

// The service will automatically run migration cycles
```

### Manual Migration Trigger

```javascript
// Trigger a manual migration cycle
await lifecycle.runMigrationCycle();

// Check migration status
const status = await lifecycle.getHealthStatus();
console.log('Active migrations:', status.activeMigrations);
```

### Configuring Policies

```javascript
import db from './config/db.js';

// Create a lifecycle policy
await db.execute(`
    INSERT INTO log_lifecycle_policies (
        tenant_id, policy_name, hot_to_warm_threshold,
        warm_to_cold_threshold, cold_retention_days
    ) VALUES (
        $1, $2, $3, $4, $5
    )
`, [tenantId, 'Custom Policy', 45, 120, 730]);
```

### Monitoring Storage Usage

```javascript
// Get current storage statistics
const stats = await db.execute(`
    SELECT * FROM calculate_storage_tier_stats($1)
`, [tenantId]);

console.log('Storage by tier:', stats);
```

## API Endpoints

### Lifecycle Management

```
GET  /api/log-lifecycle/status              # Get service status
POST /api/log-lifecycle/run-migration       # Trigger manual migration
POST /api/log-lifecycle/run-monitoring      # Trigger manual monitoring
```

### Policy Management

```
GET  /api/log-lifecycle/policies             # List policies
POST /api/log-lifecycle/policies             # Create policy
PUT  /api/log-lifecycle/policies/:id         # Update policy
```

### Storage Management

```
GET  /api/log-lifecycle/storage-locations    # List storage locations
POST /api/log-lifecycle/storage-locations    # Create storage location
GET  /api/log-lifecycle/storage-stats        # Get storage statistics
```

### Monitoring and History

```
GET  /api/log-lifecycle/migration-history    # Get migration history
GET  /api/log-lifecycle/monitoring           # Get monitoring data
```

## Monitoring

### Key Metrics

- **Migration Throughput**: Logs migrated per hour
- **Storage Utilization**: Usage percentage by tier
- **Migration Success Rate**: Percentage of successful migrations
- **Cost Savings**: Estimated cost reduction from tiered storage

### Health Checks

```javascript
const health = await lifecycle.getHealthStatus();
console.log('Service Status:', health.status);
console.log('Active Migrations:', health.activeMigrations);
console.log('Migration Interval:', health.migrationIntervalMinutes);
```

### Alert Types

- **Storage Threshold Exceeded**: When any tier exceeds configured usage threshold
- **Migration Failures**: When automated migrations fail repeatedly
- **Service Health**: When the lifecycle service becomes unhealthy

## Security Considerations

### Data Privacy

- Tenant isolation prevents cross-tenant data access
- Audit trails for all lifecycle operations
- Secure storage credentials management

### Access Control

- Role-based access to lifecycle configuration
- Audit logging for policy and location changes
- Secure API authentication and authorization

### Data Integrity

- Checksums for migrated data validation
- Transactional migration operations
- Rollback capabilities for failed migrations

## Troubleshooting

### Common Issues

1. **Migrations Not Running**
   - Check service initialization and Redis connectivity
   - Verify lifecycle policies are active
   - Check migration schedule configuration

2. **Storage Threshold Alerts**
   - Review storage location capacity settings
   - Check actual storage usage vs configured limits
   - Consider adjusting thresholds or adding capacity

3. **Migration Performance**
   - Adjust batch sizes for better throughput
   - Check database performance and indexing
   - Monitor concurrent migration limits

### Debug Mode

Enable detailed logging for troubleshooting:

```javascript
process.env.LOG_LEVEL = 'debug';
process.env.LIFECYCLE_DEBUG = 'true';
```

## Deployment

### Service Integration

Add to your main application startup:

```javascript
import logLifecycleJob from './jobs/logLifecycleJob.js';

// Initialize lifecycle job
await logLifecycleJob.initialize();

// Start automated lifecycle management
// (runs automatically based on schedule)
```

### Database Migration

Run the lifecycle automation migration:

```bash
# Apply database schema changes
psql -d wealth_vault -f backend/db/migrations/log-lifecycle-automation.sql
```

### Configuration

Update your environment configuration:

```bash
# Lifecycle Automation
LIFECYCLE_MIGRATION_INTERVAL=60
LIFECYCLE_BATCH_SIZE=1000
LIFECYCLE_MAX_CONCURRENT=3
LIFECYCLE_STORAGE_THRESHOLD=80
```

## Integration with Existing Systems

### Compression Service Integration

The lifecycle automation works seamlessly with the differential log compression service:

- Cold storage can use higher compression ratios
- Migration triggers can compress data during tier transitions
- Compression statistics are tracked per storage tier

### Anomaly Detection Integration

Lifecycle policies can consider anomaly detection results:

- Anomalous logs can be retained longer in hot storage
- Migration policies can exclude high-priority logs
- Integration with alert systems for lifecycle events

### Audit Trail Integration

All lifecycle operations are audited:

- Migration operations are logged in audit trails
- Policy changes are tracked with full audit history
- Access to lifecycle configuration is audited

## Cost Optimization

### Storage Cost Analysis

```sql
-- Calculate storage costs by tier
SELECT
    storage_tier,
    SUM(data_size_gb) as total_size_gb,
    SUM(data_size_gb * cost_per_gb) as total_cost
FROM log_lifecycle_monitoring llm
JOIN log_storage_locations lsl ON llm.tenant_id = lsl.tenant_id
WHERE llm.monitoring_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY storage_tier;
```

### Migration ROI Calculation

The system provides automatic cost savings through:

- **Hot Storage Reduction**: Moving old logs to cheaper tiers
- **Compression Savings**: Additional compression in warm/cold storage
- **Operational Efficiency**: Reduced manual archival overhead

## Contributing

### Development Setup

1. Ensure database migrations are applied
2. Initialize lifecycle service in application startup
3. Configure storage locations and policies
4. Test with sample data before production deployment

### Testing

```bash
# Run lifecycle automation tests
npm test -- --testPathPattern=logLifecycle

# Test migration scenarios
npm run test:migration

# Performance testing
npm run test:lifecycle-performance
```

### Code Standards

- Follow existing async/await patterns
- Include comprehensive error handling
- Add database transactions for data integrity
- Update API documentation for new endpoints

## Future Enhancements

### Planned Features

- **Cloud Storage Integration**: Support for AWS S3, Azure Blob Storage, Google Cloud Storage
- **Advanced Compression**: Integration with more compression algorithms
- **Predictive Migration**: ML-based prediction of access patterns
- **Custom Retention Policies**: Flexible retention rules beyond age-based
- **Cross-Region Replication**: Geo-redundant storage options

### Scalability Improvements

- **Distributed Processing**: Support for multiple migration workers
- **Queue-Based Migration**: Redis-based migration queues for high throughput
- **Incremental Migration**: Migrate only changed data instead of full records

This implementation provides a complete solution for automated log lifecycle management, reducing operational overhead while optimizing storage costs through intelligent tiered storage.</content>
<parameter name="filePath">c:\Users\Gupta\Downloads\Wealth-Vault\LOG_LIFECYCLE_AUTOMATION_README.md