// backend/jobs/logRedactionJob.js
// Issue #650: Fine-Grained Log Redaction Engine - Background Processing Job

import { logger } from '../utils/logger.js';
import { redis } from '../config/redis.js';
import { db } from '../config/database.js';
import { logRedactionRules } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import {
    redactLogEntry,
    REDACTION_TYPES,
    SENSITIVE_FIELD_TYPES,
    detokenizeValue
} from '../services/logRedactionService.js';
import { auditLogs } from '../db/schema.js';

class LogRedactionJob {
    constructor() {
        this.jobName = 'log_redaction';
        this.queueName = 'log-redaction-queue';
        this.maxRetries = 3;
        this.retryDelay = 5000; // 5 seconds
    }

    /**
     * Initialize the log redaction job processor
     */
    async initialize() {
        try {
            // Set up Redis-based job queue processing
            await this.setupQueueProcessor();
            logger.info('Log redaction job initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize log redaction job', error);
            throw error;
        }
    }

    /**
     * Set up Redis queue processor for log redaction jobs
     */
    async setupQueueProcessor() {
        // Process jobs from the queue
        setInterval(async () => {
            try {
                await this.processPendingJobs();
            } catch (error) {
                logger.error('Error processing log redaction jobs', error);
            }
        }, 1000); // Process every second

        // Clean up expired tokens periodically
        setInterval(async () => {
            try {
                await this.cleanupExpiredTokens();
            } catch (error) {
                logger.error('Error cleaning up expired tokens', error);
            }
        }, 3600000); // Clean up every hour
    }

    /**
     * Process pending log redaction jobs from the queue
     */
    async processPendingJobs() {
        const jobKey = `queue:${this.queueName}`;

        // Get next job from queue
        const jobData = await redis.lpop(jobKey);
        if (!jobData) return;

        let job;
        try {
            job = JSON.parse(jobData);
        } catch (error) {
            logger.error('Invalid job data format', { jobData, error });
            return;
        }

        try {
            await this.processJob(job);
        } catch (error) {
            logger.error('Job processing failed', { job, error });
            await this.handleJobFailure(job, error);
        }
    }

    /**
     * Process a single log redaction job
     */
    async processJob(job) {
        const { type, data, tenantId, jobId } = job;

        logger.info('Processing log redaction job', { type, jobId, tenantId });

        switch (type) {
            case 'redact_log_entry':
                await this.redactLogEntry(data, tenantId);
                break;

            case 'batch_redact_logs':
                await this.batchRedactLogs(data, tenantId);
                break;

            case 'validate_redaction_rules':
                await this.validateRedactionRules(tenantId);
                break;

            case 'cleanup_expired_tokens':
                await this.cleanupExpiredTokens();
                break;

            default:
                throw new Error(`Unknown job type: ${type}`);
        }

        logger.info('Log redaction job completed', { type, jobId });
    }

    /**
     * Redact a single log entry
     */
    async redactLogEntry(logData, tenantId) {
        try {
            // Get active redaction rules for the tenant
            const rules = await this.getActiveRedactionRules(tenantId);

            if (rules.length === 0) {
                logger.debug('No active redaction rules found for tenant', { tenantId });
                return logData;
            }

            // Apply redaction rules
            const redactedData = await redactLogEntry(logData, rules, tenantId);

            // Log the redaction operation for audit
            await this.logRedactionOperation(tenantId, 'single_entry', {
                originalSize: JSON.stringify(logData).length,
                redactedSize: JSON.stringify(redactedData).length,
                rulesApplied: rules.length
            });

            return redactedData;

        } catch (error) {
            logger.error('Error redacting log entry', { tenantId, error });
            throw error;
        }
    }

    /**
     * Batch redact multiple log entries
     */
    async batchRedactLogs(batchData, tenantId) {
        const { logIds, logEntries } = batchData;

        try {
            // Get active redaction rules for the tenant
            const rules = await this.getActiveRedactionRules(tenantId);

            if (rules.length === 0) {
                logger.debug('No active redaction rules found for tenant', { tenantId });
                return logEntries;
            }

            const redactedEntries = [];
            let totalOriginalSize = 0;
            let totalRedactedSize = 0;

            // Process each log entry
            for (const entry of logEntries) {
                const redactedEntry = await redactLogEntry(entry, rules, tenantId);
                redactedEntries.push(redactedEntry);

                totalOriginalSize += JSON.stringify(entry).length;
                totalRedactedSize += JSON.stringify(redactedEntry).length;
            }

            // Update the log entries in database if logIds provided
            if (logIds && logIds.length > 0) {
                await this.updateRedactedLogs(logIds, redactedEntries, tenantId);
            }

            // Log the batch redaction operation
            await this.logRedactionOperation(tenantId, 'batch_entries', {
                entryCount: logEntries.length,
                totalOriginalSize,
                totalRedactedSize,
                rulesApplied: rules.length,
                compressionRatio: totalRedactedSize / totalOriginalSize
            });

            return redactedEntries;

        } catch (error) {
            logger.error('Error batch redacting logs', { tenantId, entryCount: logEntries.length, error });
            throw error;
        }
    }

    /**
     * Validate redaction rules for consistency and effectiveness
     */
    async validateRedactionRules(tenantId) {
        try {
            const rules = await this.getActiveRedactionRules(tenantId);

            const validationResults = {
                totalRules: rules.length,
                conflicts: [],
                coverage: {},
                recommendations: []
            };

            // Check for conflicting rules (same field path with different types)
            const fieldPaths = {};
            for (const rule of rules) {
                if (fieldPaths[rule.fieldPath]) {
                    validationResults.conflicts.push({
                        fieldPath: rule.fieldPath,
                        conflictingRules: [fieldPaths[rule.fieldPath], rule.id]
                    });
                } else {
                    fieldPaths[rule.fieldPath] = rule.id;
                }
            }

            // Analyze coverage by field types
            validationResults.coverage = this.analyzeFieldCoverage(rules);

            // Generate recommendations
            validationResults.recommendations = this.generateValidationRecommendations(validationResults);

            // Log validation results
            await this.logRedactionOperation(tenantId, 'rule_validation', validationResults);

            return validationResults;

        } catch (error) {
            logger.error('Error validating redaction rules', { tenantId, error });
            throw error;
        }
    }

    /**
     * Clean up expired redaction tokens
     */
    async cleanupExpiredTokens() {
        try {
            const tokenKeys = await redis.keys('redaction:token:*');
            let cleanedCount = 0;

            for (const key of tokenKeys) {
                const ttl = await redis.ttl(key);
                if (ttl <= 0) {
                    await redis.del(key);
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                logger.info('Cleaned up expired redaction tokens', { cleanedCount });
            }

        } catch (error) {
            logger.error('Error cleaning up expired tokens', error);
        }
    }

    /**
     * Get active redaction rules for a tenant
     */
    async getActiveRedactionRules(tenantId) {
        try {
            const rules = await db
                .select()
                .from(logRedactionRules)
                .where(
                    and(
                        eq(logRedactionRules.tenantId, tenantId),
                        eq(logRedactionRules.isActive, true)
                    )
                )
                .orderBy(desc(logRedactionRules.priority));

            return rules.map(rule => ({
                id: rule.id,
                fieldPath: rule.fieldPath,
                redactionType: rule.redactionType,
                fieldType: rule.fieldType,
                pattern: rule.pattern,
                priority: rule.priority
            }));

        } catch (error) {
            logger.error('Error fetching redaction rules', { tenantId, error });
            throw error;
        }
    }

    /**
     * Update redacted log entries in database
     */
    async updateRedactedLogs(logIds, redactedEntries, tenantId) {
        // This would update the actual log entries in the audit_logs table
        // Implementation depends on the specific log storage schema
        logger.info('Updating redacted logs in database', {
            tenantId,
            logCount: logIds.length
        });

        // Placeholder for actual database update logic
        // In a real implementation, this would update the log entries
        // with their redacted versions
    }

    /**
     * Analyze field coverage by redaction rules
     */
    analyzeFieldCoverage(rules) {
        const coverage = {
            email: false,
            phone: false,
            ssn: false,
            credit_card: false,
            ip_address: false,
            name: false,
            address: false,
            custom: 0
        };

        for (const rule of rules) {
            if (rule.fieldType && coverage.hasOwnProperty(rule.fieldType)) {
                if (rule.fieldType === 'custom') {
                    coverage.custom++;
                } else {
                    coverage[rule.fieldType] = true;
                }
            }
        }

        return coverage;
    }

    /**
     * Generate validation recommendations
     */
    generateValidationRecommendations(validationResults) {
        const recommendations = [];

        // Check for missing common PII protections
        const commonFields = ['email', 'phone', 'ssn', 'credit_card'];
        for (const field of commonFields) {
            if (!validationResults.coverage[field]) {
                recommendations.push(`Add redaction rule for ${field} fields`);
            }
        }

        // Check for conflicts
        if (validationResults.conflicts.length > 0) {
            recommendations.push(`Resolve ${validationResults.conflicts.length} conflicting redaction rules`);
        }

        // Check for low custom rule count
        if (validationResults.coverage.custom < 3) {
            recommendations.push('Consider adding more custom field redaction rules for comprehensive PII protection');
        }

        return recommendations;
    }

    /**
     * Log redaction operation for audit purposes
     */
    async logRedactionOperation(tenantId, operationType, details) {
        try {
            await db.insert(auditLogs).values({
                tenantId,
                userId: null, // System operation
                action: 'log_redaction',
                resource: 'log_redaction_engine',
                resourceId: null,
                details: {
                    operationType,
                    ...details,
                    timestamp: new Date().toISOString()
                },
                ipAddress: 'system',
                userAgent: 'log-redaction-job',
                severity: 'info'
            });
        } catch (error) {
            logger.error('Error logging redaction operation', { tenantId, operationType, error });
        }
    }

    /**
     * Handle job processing failure with retry logic
     */
    async handleJobFailure(job, error) {
        const { retryCount = 0 } = job;

        if (retryCount < this.maxRetries) {
            // Schedule retry
            const retryJob = {
                ...job,
                retryCount: retryCount + 1
            };

            setTimeout(async () => {
                await this.queueJob(retryJob);
            }, this.retryDelay * (retryCount + 1));

            logger.warn('Retrying failed log redaction job', {
                jobId: job.jobId,
                retryCount: retryCount + 1,
                error: error.message
            });
        } else {
            // Max retries exceeded, log failure
            logger.error('Log redaction job failed permanently', {
                job,
                error: error.message
            });

            // Could implement dead letter queue here
        }
    }

    /**
     * Queue a log redaction job
     */
    async queueJob(job) {
        const jobData = JSON.stringify({
            ...job,
            jobId: job.jobId || `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            queuedAt: new Date().toISOString()
        });

        await redis.rpush(`queue:${this.queueName}`, jobData);
        logger.info('Queued log redaction job', { type: job.type, jobId: job.jobId });
    }

    /**
     * Public method to queue a log entry for redaction
     */
    async queueLogEntryRedaction(logData, tenantId) {
        await this.queueJob({
            type: 'redact_log_entry',
            data: logData,
            tenantId
        });
    }

    /**
     * Public method to queue batch log redaction
     */
    async queueBatchLogRedaction(logIds, logEntries, tenantId) {
        await this.queueJob({
            type: 'batch_redact_logs',
            data: { logIds, logEntries },
            tenantId
        });
    }

    /**
     * Public method to queue rule validation
     */
    async queueRuleValidation(tenantId) {
        await this.queueJob({
            type: 'validate_redaction_rules',
            data: {},
            tenantId
        });
    }
}

// Export singleton instance
export const logRedactionJob = new LogRedactionJob();
export default logRedactionJob;