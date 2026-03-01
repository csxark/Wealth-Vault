import { pgTable, uuid, varchar, text, timestamp, decimal, jsonb, boolean, integer, foreignKey, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { tenants } from './schema.js';

/**
 * Audit Log Retention and Compression Schema
 * 
 * Issue #614: Audit Log Compression and Retention Policy Enforcement
 * 
 * Features:
 * - Time-based partitioning of audit logs
 * - Configurable retention policies per tenant
 * - Archival to cold storage (S3)
 * - Compression and deduplication
 * - Regulatory compliance tracking
 * - Retention audit trail
 */

export const auditLogRetentionPolicies = pgTable(
  'audit_log_retention_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    
    // Policy definition
    policyName: varchar('policy_name', { length: 100 }).notNull(),
    description: text('description'),
    
    // Retention configuration
    retentionDays: integer('retention_days').notNull(), // How long to keep logs
    archiveAfterDays: integer('archive_after_days').notNull(), // Move to cold storage after N days
    deleteAfterDays: integer('delete_after_days').notNull(), // Permanently delete after N days
    
    // Compliance requirements
    complianceFramework: varchar('compliance_framework', { length: 50 }), // GDPR, HIPAA, SOC2, PCI-DSS, ISO27001
    regulatoryRequirement: varchar('regulatory_requirement', { length: 100 }), // e.g., "GDPR Art. 32"
    minRetentionDays: integer('min_retention_days'), // Minimum retention mandated by regulation
    
    // Compression settings
    compressionEnabled: boolean('compression_enabled').default(true),
    compressionAfterDays: integer('compression_after_days').default(30), // Compress after N days
    compressionFormat: varchar('compression_format', { length: 20 }).default('gzip'), // gzip, zstd, brotli
    
    // Archival settings
    archiveEnabled: boolean('archive_enabled').default(true),
    archiveDestination: varchar('archive_destination', { length: 100 }), // S3 bucket, Azure Blob, GCS
    archiveFormat: varchar('archive_format', { length: 50 }).default('parquet'), // parquet, avro, jsonl
    
    // Encryption
    encryptionEnabled: boolean('encryption_enabled').default(true),
    encryptionKeyId: varchar('encryption_key_id', { length: 255 }), // KMS key reference
    
    // Exclusions
    excludedEventTypes: text('excluded_event_types').array(), // Don't apply policy to these events
    excludedUsers: text('excluded_users').array(), // System users exempt from deletion
    
    // Policy state
    isActive: boolean('is_active').default(true),
    appliedAt: timestamp('applied_at'),
    
    // Tracking
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    tenantActiveIdx: uniqueIndex('idx_audit_policies_tenant_active')
      .on(table.tenantId)
      .where(table.isActive),
    complianceIdx: index('idx_audit_policies_compliance')
      .on(table.complianceFramework),
  })
);

export const auditLogArchives = pgTable(
  'audit_log_archives',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    
    // Archive batch information
    archiveBatchId: varchar('archive_batch_id', { length: 100 }).notNull(), // Unique ID for batch
    period: varchar('period', { length: 20 }).notNull(), // daily, weekly, monthly (format: YYYY-MM-DD)
    
    // Source data
    logCount: integer('log_count').notNull(), // Number of logs in archive
    dateRangeStart: timestamp('date_range_start').notNull(), // Logs from this date
    dateRangeEnd: timestamp('date_range_end').notNull(), // ...to this date
    
    // Storage information
    storagePath: varchar('storage_path', { length: 255 }).notNull(), // S3 path or similar
    storageSize: decimal('storage_size', { precision: 18, scale: 2 }).notNull(), // Bytes stored
    compressionRatio: decimal('compression_ratio', { precision: 5, scale: 2 }).default('1'), // Original/compressed
    
    // Encryption
    encryptionKeyId: varchar('encryption_key_id', { length: 255 }),
    encryptionHash: varchar('encryption_hash', { length: 255 }), // For verification
    
    // Integrity
    checksumAlgorithm: varchar('checksum_algorithm', { length: 20 }).default('sha256'),
    checksumValue: varchar('checksum_value', { length: 255 }).notNull(), // For data integrity verification
    
    // Status
    status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, in-progress, completed, failed, verified, replicated
    progressPercent: integer('progress_percent').default(0),
    errorMessage: text('error_message'),
    
    // Retention tracking
    deletionScheduledAt: timestamp('deletion_scheduled_at'), // When deletion is scheduled
    deletedAt: timestamp('deleted_at'), // Actual deletion
    retrievalCount: integer('retrieval_count').default(0), // Times retrieved for audit
    lastRetrievedAt: timestamp('last_retrieved_at'),
    
    // Metadata
    archiveReason: varchar('archive_reason', { length: 100 }), // age, space-optimization, compliance
    metadata: jsonb('metadata').default({}), // {sourcePartition, fileCount, format, schemaVersion}
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    batchIdx: uniqueIndex('idx_audit_archives_batch_id')
      .on(table.archiveBatchId),
    tenantPeriodIdx: index('idx_audit_archives_tenant_period')
      .on(table.tenantId, table.period),
    statusIdx: index('idx_audit_archives_status').on(table.status),
    dateRangeIdx: index('idx_audit_archives_date_range')
      .on(table.dateRangeStart, table.dateRangeEnd),
  })
);

export const auditLogCompressionJobs = pgTable(
  'audit_log_compression_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    
    // Job identification
    jobName: varchar('job_name', { length: 100 }).notNull(),
    jobType: varchar('job_type', { length: 50 }).notNull(), // compress, archive, delete, verify, replicate
    
    // Target specification
    dateRangeStart: timestamp('date_range_start').notNull(),
    dateRangeEnd: timestamp('date_range_end').notNull(),
    logCount: integer('log_count').notNull(),
    
    // Execution details
    status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, running, completed, failed, cancelled
    priority: integer('priority').default(50), // 0-100, higher = more important
    retryCount: integer('retry_count').default(0),
    maxRetries: integer('max_retries').default(3),
    
    // Performance
    processingStartedAt: timestamp('processing_started_at'),
    processingCompletedAt: timestamp('processing_completed_at'),
    processingDurationMs: integer('processing_duration_ms'),
    logsProcessedPerSecond: decimal('logs_processed_per_second', { precision: 10, scale: 2 }),
    
    // Results
    successCount: integer('success_count').default(0),
    failureCount: integer('failure_count').default(0),
    skippedCount: integer('skipped_count').default(0),
    
    // Archival result
    archiveId: uuid('archive_id'), // Reference to created archive
    
    // Error handling
    errorMessage: text('error_message'),
    errorDetails: jsonb('error_details'),
    
    // Integrity
    integrityChecksPassed: boolean('integrity_checks_passed'),
    integrityCheckDetails: jsonb('integrity_check_details'),
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    tenantStatusIdx: index('idx_compression_jobs_tenant_status')
      .on(table.tenantId, table.status),
    jobTypeIdx: index('idx_compression_jobs_type').on(table.jobType),
    priorityIdx: index('idx_compression_jobs_priority')
      .on(table.priority)
      .where(table.status === 'pending'),
  })
);

export const retentionPolicyExecutions = pgTable(
  'retention_policy_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => auditLogRetentionPolicies.id, { onDelete: 'cascade' }),
    
    // Execution tracking
    executionStartedAt: timestamp('execution_started_at').notNull(),
    executionCompletedAt: timestamp('execution_completed_at'),
    
    // Phase tracking
    phases: jsonb('phases').notNull(), // [{phase: 'compression', status: 'completed', duration: 1500}]
    
    // Results
    logsCompressed: integer('logs_compressed').default(0),
    logsArchived: integer('logs_archived').default(0),
    logsDeletedByAge: integer('logs_deleted_by_age').default(0),
    logsDeletedByCount: integer('logs_deleted_by_count').default(0),
    
    // Storage impact
    spaceSavedBytes: decimal('space_saved_bytes', { precision: 18, scale: 0 }).default('0'),
    archiveSizeBytes: decimal('archive_size_bytes', { precision: 18, scale: 0 }).default('0'),
    
    // Status
    status: varchar('status', { length: 20 }).notNull().default('in-progress'), // in-progress, completed, failed, partial
    errorMessage: text('error_message'),
    
    // Metadata
    executionNotes: text('execution_notes'),
    operatorNotes: text('operator_notes'),
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    tenantPolicyIdx: index('idx_retention_executions_tenant_policy')
      .on(table.tenantId, table.policyId),
    statusIdx: index('idx_retention_executions_status').on(table.status),
    dateIdx: index('idx_retention_executions_date')
      .on(table.executionStartedAt),
  })
);

export const auditLogRetentionMetrics = pgTable(
  'audit_log_retention_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    policyId: uuid('policy_id')
      .references(() => auditLogRetentionPolicies.id, { onDelete: 'set null' }),
    
    // Period
    periodType: varchar('period_type', { length: 20 }).notNull(), // daily, weekly, monthly
    periodDate: timestamp('period_date').notNull(), // Date representing the period
    
    // Log metrics
    totalLogsInSystem: integer('total_logs_in_system'),
    logsCreatedThisDay: integer('logs_created_this_day'),
    logsCompressedThisDay: integer('logs_compressed_this_day'),
    logsArchivedThisDay: integer('logs_archived_this_day'),
    logsDeletedThisDay: integer('logs_deleted_this_day'),
    
    // Storage metrics
    activeStorageBytes: decimal('active_storage_bytes', { precision: 18, scale: 0 }),
    compressedStorageBytes: decimal('compressed_storage_bytes', { precision: 18, scale: 0 }),
    archivedStorageBytes: decimal('archived_storage_bytes', { precision: 18, scale: 0 }),
    totalStorageBytes: decimal('total_storage_bytes', { precision: 18, scale: 0 }),
    
    // Performance metrics
    avgCompressionRatio: decimal('avg_compression_ratio', { precision: 5, scale: 2 }),
    avgProcessingTimeMs: decimal('avg_processing_time_ms', { precision: 10, scale: 2 }),
    
    // Compliance metrics
    policyCompliancePercent: integer('policy_compliance_percent'), // 0-100
    retentionViolationCount: integer('retention_violation_count').default(0),
    
    // Costs
    estimatedMonthlyStorageCost: decimal('estimated_monthly_storage_cost', { precision: 10, scale: 2 }),
    monthlyCompressionSavings: decimal('monthly_compression_savings', { precision: 10, scale: 2 }),
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    tenantPeriodIdx: index('idx_retention_metrics_tenant_period')
      .on(table.tenantId, table.periodDate),
    complianceIdx: index('idx_retention_metrics_compliance')
      .on(table.policyCompliancePercent),
  })
);

// Zod schemas for validation
export const createRetentionPolicySchema = createInsertSchema(auditLogRetentionPolicies);
export const createArchiveSchema = createInsertSchema(auditLogArchives);
export const createCompressionJobSchema = createInsertSchema(auditLogCompressionJobs);
export const createPolicyExecutionSchema = createInsertSchema(retentionPolicyExecutions);
