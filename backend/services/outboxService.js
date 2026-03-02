import db from '../config/db.js';
import { outboxEvents } from '../db/schema.js';
import { eq, and, or, lte, isNull, gt, ne } from 'drizzle-orm';
import logger from '../utils/logger.js';

// Processing timeout (5 minutes) - events stuck in processing for longer are considered stale
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const PROCESSING_TIMEOUT_SECONDS = PROCESSING_TIMEOUT_MS / 1000;

// Generate unique worker ID (could be hostname + process ID in production)
const WORKER_ID = `${process.env.HOSTNAME || 'worker'}_${process.pid}_${Date.now()}`;

/**
 * Outbox Service - Transactional Outbox Pattern Implementation
 * 
 * Ensures reliable event publishing by storing events in the same transaction as business data.
 * Events are then dispatched by a background worker to external systems/message bus.
 * 
 * This prevents data inconsistencies between the database and external systems.
 */

class OutboxService {
    /**
     * Create a new outbox event within a database transaction
     * @param {Object} tx - Database transaction object
     * @param {Object} event - Event details
     * @param {string} event.tenantId - Tenant ID
     * @param {string} event.aggregateType - Type of aggregate (e.g., 'tenant', 'user', 'expense')
     * @param {string} event.aggregateId - ID of the aggregate
     * @param {string} event.eventType - Event type (e.g., 'tenant.created', 'user.invited')
     * @param {Object} event.payload - Event payload data
     * @param {Object} event.metadata - Optional metadata
     * @returns {Promise<Object>} Created outbox event
     */
    async createEvent(tx, { tenantId, aggregateType, aggregateId, eventType, payload, metadata = {} }) {
        try {
            const [event] = await tx.insert(outboxEvents).values({
                tenantId: tenantId || null,
                aggregateType,
                aggregateId,
                eventType,
                payload,
                metadata: {
                    ...metadata,
                    createdBy: 'system',
                    timestamp: new Date().toISOString()
                },
                status: 'pending',
                retryCount: 0,
                maxRetries: 3
            }).returning();

            logger.info('Outbox event created', {
                eventId: event.id,
                eventType: event.eventType,
                aggregateType: event.aggregateType,
                aggregateId: event.aggregateId
            });

            return event;
        } catch (error) {
            logger.error('Failed to create outbox event', {
                error: error.message,
                eventType,
                aggregateType,
                aggregateId
            });
            throw error;
        }
    }

    /**
     * Create multiple outbox events in a single transaction
     * @param {Object} tx - Database transaction object
     * @param {Array<Object>} events - Array of event objects
     * @returns {Promise<Array<Object>>} Created outbox events
     */
    async createEvents(tx, events) {
        try {
            const eventValues = events.map(event => ({
                tenantId: event.tenantId || null,
                aggregateType: event.aggregateType,
                aggregateId: event.aggregateId,
                eventType: event.eventType,
                payload: event.payload,
                metadata: {
                    ...event.metadata || {},
                    createdBy: 'system',
                    timestamp: new Date().toISOString()
                },
                status: 'pending',
                retryCount: 0,
                maxRetries: event.maxRetries || 3
            }));

            const createdEvents = await tx.insert(outboxEvents).values(eventValues).returning();

            logger.info('Multiple outbox events created', {
                count: createdEvents.length,
                eventTypes: events.map(e => e.eventType)
            });

            return createdEvents;
        } catch (error) {
            logger.error('Failed to create multiple outbox events', {
                error: error.message,
                count: events.length
            });
            throw error;
        }
    }

    /**
     * Get pending events ready for processing
     * DEPRECATED: Use getPendingEventsWithLocking() instead for race condition safety
     * @param {number} limit - Maximum number of events to fetch
     * @returns {Promise<Array<Object>>} Pending events
     */
    async getPendingEvents(limit = 100) {
        try {
            const events = await db
                .select()
                .from(outboxEvents)
                .where(
                    or(
                        eq(outboxEvents.status, 'pending'),
                        and(
                            eq(outboxEvents.status, 'failed'),
                            lte(outboxEvents.retryCount, outboxEvents.maxRetries)
                        )
                    )
                )
                .orderBy(outboxEvents.createdAt)
                .limit(limit);

            return events;
        } catch (error) {
            logger.error('Failed to fetch pending events', { error: error.message });
            throw error;
        }
    }

    /**
     * Get pending events with row-level locking (FOR UPDATE SKIP LOCKED)
     * This prevents race conditions where multiple workers process the same event
     * 
     * How it works:
     * 1. SELECT with FOR UPDATE SKIP LOCKED locks rows for this transaction
     * 2. SKIP LOCKED automatically skips rows already locked by other workers
     * 3. Only this worker can fetch these specific events
     * 4. Must update status to 'processing' within transaction to hold the lock
     * 
     * @param {number} limit - Maximum number of events to fetch
     * @returns {Promise<Array<Object>>} Pending events (locked for this worker)
     */
    async getPendingEventsWithLocking(limit = 100) {
        try {
            const now = new Date();
            const timeoutThreshold = new Date(now.getTime() - PROCESSING_TIMEOUT_MS);

            // Use raw SQL for row-level locking (FOR UPDATE SKIP LOCKED)
            const sql = `
                SELECT * FROM outbox_events
                WHERE (
                    status = 'pending'
                    OR (
                        status = 'failed'
                        AND retry_count < max_retries
                    )
                    OR (
                        status = 'processing'
                        AND processing_started_at < $1
                    )
                )
                ORDER BY created_at ASC
                LIMIT $2
                FOR UPDATE SKIP LOCKED
            `;

            const events = await db.execute(sql, [timeoutThreshold, limit]);

            if (!events || events.length === 0) {
                return [];
            }

            // Map the raw result to the expected format
            return events.map(row => ({
                id: row.id,
                tenantId: row.tenant_id,
                aggregateType: row.aggregate_type,
                aggregateId: row.aggregate_id,
                eventType: row.event_type,
                payload: row.payload,
                metadata: row.metadata,
                status: row.status,
                retryCount: row.retry_count,
                maxRetries: row.max_retries,
                lastError: row.last_error,
                processedAt: row.processed_at,
                publishedAt: row.published_at,
                processingBy: row.processing_by,
                processingStartedAt: row.processing_started_at,
                lastHeartbeat: row.last_heartbeat,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            }));
        } catch (error) {
            logger.error('Failed to fetch pending events with locking', { error: error.message });
            throw error;
        }
    }

    /**
     * Mark an event as processing with worker ID tracking
     * This atomically claims the event for this worker
     * @param {string} eventId - Event ID
     * @param {string} workerId - Worker ID claiming this event (optional, uses WORKER_ID)
     * @returns {Promise<Object>} Updated event
     */
    async markAsProcessing(eventId, workerId = WORKER_ID) {
        try {
            const now = new Date();
            const [event] = await db
                .update(outboxEvents)
                .set({
                    status: 'processing',
                    processingBy: workerId,
                    processingStartedAt: now,
                    lastHeartbeat: now,
                    processedAt: now,
                    updatedAt: now
                })
                .where(eq(outboxEvents.id, eventId))
                .returning();

            logger.debug('Event marked as processing', {
                eventId: event.id,
                eventType: event.eventType,
                processingBy: event.processingBy
            });

            return event;
        } catch (error) {
            logger.error('Failed to mark event as processing', {
                error: error.message,
                eventId
            });
            throw error;
        }
    }

    /**
     * Send heartbeat for an event being processed
     * This prevents the event from being considered stuck/timed-out
     * @param {string} eventId - Event ID
     * @param {string} workerId - Worker ID (optional, uses WORKER_ID)
     * @returns {Promise<Object>} Updated event
     */
    async updateHeartbeat(eventId, workerId = WORKER_ID) {
        try {
            const now = new Date();
            const [event] = await db
                .update(outboxEvents)
                .set({
                    lastHeartbeat: now,
                    updatedAt: now
                })
                .where(
                    and(
                        eq(outboxEvents.id, eventId),
                        eq(outboxEvents.processingBy, workerId),
                        eq(outboxEvents.status, 'processing')
                    )
                )
                .returning();

            if (!event) {
                logger.warn('Failed to update heartbeat - event not being processed by this worker', {
                    eventId,
                    workerId
                });
            }

            return event;
        } catch (error) {
            logger.error('Failed to update event heartbeat', {
                error: error.message,
                eventId
            });
            throw error;
        }
    }

    /**
     * Mark an event as successfully published
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Updated event
     */
    async markAsPublished(eventId) {
        try {
            const [event] = await db
                .update(outboxEvents)
                .set({
                    status: 'published',
                    publishedAt: new Date(),
                    updatedAt: new Date()
                })
                .where(eq(outboxEvents.id, eventId))
                .returning();

            logger.info('Event published successfully', {
                eventId: event.id,
                eventType: event.eventType
            });

            return event;
        } catch (error) {
            logger.error('Failed to mark event as published', {
                error: error.message,
                eventId
            });
            throw error;
        }
    }

    /**
     * Mark an event as failed and increment retry count
     * @param {string} eventId - Event ID
     * @param {string} errorMessage - Error message
     * @param {string} workerId - Worker ID (optional, for logging)
     * @returns {Promise<Object>} Updated event
     */
    async markAsFailed(eventId, errorMessage, workerId = WORKER_ID) {
        try {
            const [event] = await db
                .update(outboxEvents)
                .set({
                    status: 'failed',
                    lastError: errorMessage,
                    retryCount: db.raw('retry_count + 1'),
                    processingBy: null,
                    processingStartedAt: null,
                    lastHeartbeat: null,
                    updatedAt: new Date()
                })
                .where(eq(outboxEvents.id, eventId))
                .returning();

            logger.warn('Event marked as failed', {
                eventId: event.id,
                eventType: event.eventType,
                retryCount: event.retryCount,
                maxRetries: event.maxRetries,
                processingWorkerId: workerId,
                error: errorMessage
            });

            // If max retries exceeded, move to dead letter queue
            if (event.retryCount >= event.maxRetries) {
                await this.moveToDeadLetter(eventId, `Max retries exceeded after ${event.retryCount} attempts`);
            }

            return event;
        } catch (error) {
            logger.error('Failed to mark event as failed', {
                error: error.message,
                eventId
            });
            throw error;
        }
    }

    /**
     * Move an event to dead letter queue (when max retries exceeded or unrecoverable error)
     * @param {string} eventId - Event ID
     * @param {string} reason - Reason for moving to dead letter
     * @returns {Promise<Object>} Updated event
     */
    async moveToDeadLetter(eventId, reason) {
        try {
            const [event] = await db
                .update(outboxEvents)
                .set({
                    status: 'dead_letter',
                    lastError: reason,
                    processingBy: null,
                    processingStartedAt: null,
                    lastHeartbeat: null,
                    updatedAt: new Date()
                })
                .where(eq(outboxEvents.id, eventId))
                .returning();

            logger.error('Event moved to dead letter queue', {
                eventId: event.id,
                eventType: event.eventType,
                retryCount: event.retryCount,
                reason
            });

            return event;
        } catch (error) {
            logger.error('Failed to move event to dead letter', {
                error: error.message,
                eventId
            });
            throw error;
        }
    }

    /**
     * Clean up stale processing events (timeout detection)
     * Events stuck in 'processing' status for > 5 minutes are reset to 'pending'
     * This handles worker crashes/hangs
     * 
     * @returns {Promise<number>} Number of events reset
     */
    async cleanupStaleProcessing() {
        try {
            const timeoutThreshold = new Date(Date.now() - PROCESSING_TIMEOUT_MS);

            const result = await db
                .update(outboxEvents)
                .set({
                    status: 'pending',
                    processingBy: null,
                    processingStartedAt: null,
                    lastHeartbeat: null,
                    updatedAt: new Date()
                })
                .where(
                    and(
                        eq(outboxEvents.status, 'processing'),
                        lte(outboxEvents.processingStartedAt, timeoutThreshold)
                    )
                );

            const resetCount = result.rowCount || 0;

            if (resetCount > 0) {
                logger.warn('Stale processing events cleaned up', {
                    resetCount,
                    timeoutThresholdSeconds: PROCESSING_TIMEOUT_SECONDS
                });
            }

            return resetCount;
        } catch (error) {
            logger.error('Failed to cleanup stale processing events', { error: error.message });
            throw error;
        }
    }

    /**
     * Get event by ID
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Event
     */
    async getEventById(eventId) {
        try {
            const [event] = await db
                .select()
                .from(outboxEvents)
                .where(eq(outboxEvents.id, eventId));

            return event;
        } catch (error) {
            logger.error('Failed to fetch event by ID', {
                error: error.message,
                eventId
            });
            throw error;
        }
    }

    /**
     * Get events by aggregate
     * @param {string} aggregateType - Aggregate type
     * @param {string} aggregateId - Aggregate ID
     * @returns {Promise<Array<Object>>} Events
     */
    async getEventsByAggregate(aggregateType, aggregateId) {
        try {
            const events = await db
                .select()
                .from(outboxEvents)
                .where(
                    and(
                        eq(outboxEvents.aggregateType, aggregateType),
                        eq(outboxEvents.aggregateId, aggregateId)
                    )
                )
                .orderBy(outboxEvents.createdAt);

            return events;
        } catch (error) {
            logger.error('Failed to fetch events by aggregate', {
                error: error.message,
                aggregateType,
                aggregateId
            });
            throw error;
        }
    }

    /**
     * Delete old published events (for cleanup)
     * @param {number} daysOld - Delete events older than this many days
     * @returns {Promise<number>} Number of deleted events
     */
    async deleteOldPublishedEvents(daysOld = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const result = await db
                .delete(outboxEvents)
                .where(
                    and(
                        eq(outboxEvents.status, 'published'),
                        lte(outboxEvents.publishedAt, cutoffDate)
                    )
                );

            logger.info('Old published events deleted', {
                daysOld,
                deletedCount: result.rowCount || 0
            });

            return result.rowCount || 0;
        } catch (error) {
            logger.error('Failed to delete old published events', {
                error: error.message,
                daysOld
            });
            throw error;
        }
    }
}

export default new OutboxService();
