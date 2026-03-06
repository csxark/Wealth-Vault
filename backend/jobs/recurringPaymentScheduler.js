/**
 * Recurring Payment Scheduler (Issue #568)
 * 
 * Implements idempotent recurring payment processing with:
 * - Distributed scheduler coordination locks
 * - Execution fingerprinting for replay detection
 * - Unique constraint enforcement at DB level
 * - Multi-layer idempotency (scheduler + API + worker)
 * - Dead-letter handling for failed payments
 */

import { createHash, randomUUID } from 'crypto';
import { and, eq, gte, lte, or, isNull, inArray, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { goals } from '../db/schema.js';
import { 
    recurringPaymentExecutions, 
    recurringPaymentFingerprints,
    schedulerCoordinationLocks 
} from '../db/schema-recurring-payments.js';
import logger from '../utils/logger.js';
import { RecurringPaymentWorker } from './recurringPaymentWorker.js';

const SCHEDULER_LOCK_NAME = 'recurring_payment_scheduler';
const SCHEDULER_LOCK_TTL_SECONDS = 60;
const SCHEDULER_HEARTBEAT_INTERVAL = 15000; // 15 seconds
const FINGERPRINT_TTL_HOURS = 72; // 3 days
const EXECUTION_LOOKAHEAD_HOURS = 2; // Process payments due in next 2 hours

class RecurringPaymentScheduler {
    constructor() {
        this.instanceId = `scheduler-${randomUUID()}`;
        this.isLeader = false;
        this.heartbeatTimer = null;
        this.processingTimer = null;
        this.worker = new RecurringPaymentWorker();
    }

    /**
     * Generate deterministic execution fingerprint
     */
    generateFingerprint({ goalId, windowStart, windowEnd, eventId, amountCents, currency }) {
        const input = [
            goalId,
            windowStart.toISOString(),
            windowEnd.toISOString(),
            eventId || 'null',
            amountCents.toString(),
            currency
        ].join('|');

        return createHash('sha256').update(input).digest('hex');
    }

    /**
     * Calculate billing window for a goal based on recurring frequency
     */
    calculateBillingWindow(goal, referenceTime = new Date()) {
        const frequency = goal.recurringContribution?.frequency || 'monthly';
        const startDate = new Date(goal.startDate || referenceTime);
        
        let windowStart, windowEnd;
        
        switch (frequency) {
            case 'daily':
                windowStart = new Date(referenceTime);
                windowStart.setHours(0, 0, 0, 0);
                windowEnd = new Date(windowStart);
                windowEnd.setDate(windowEnd.getDate() + 1);
                break;
                
            case 'weekly':
                windowStart = new Date(referenceTime);
                windowStart.setDate(windowStart.getDate() - windowStart.getDay());
                windowStart.setHours(0, 0, 0, 0);
                windowEnd = new Date(windowStart);
                windowEnd.setDate(windowEnd.getDate() + 7);
                break;
                
            case 'biweekly':
                windowStart = new Date(referenceTime);
                windowStart.setDate(windowStart.getDate() - windowStart.getDay());
                windowStart.setHours(0, 0, 0, 0);
                windowEnd = new Date(windowStart);
                windowEnd.setDate(windowEnd.getDate() + 14);
                break;
                
            case 'monthly':
                windowStart = new Date(referenceTime.getFullYear(), referenceTime.getMonth(), 1);
                windowEnd = new Date(referenceTime.getFullYear(), referenceTime.getMonth() + 1, 1);
                break;
                
            case 'quarterly':
                const quarter = Math.floor(referenceTime.getMonth() / 3);
                windowStart = new Date(referenceTime.getFullYear(), quarter * 3, 1);
                windowEnd = new Date(referenceTime.getFullYear(), (quarter + 1) * 3, 1);
                break;
                
            case 'yearly':
                windowStart = new Date(referenceTime.getFullYear(), 0, 1);
                windowEnd = new Date(referenceTime.getFullYear() + 1, 0, 1);
                break;
                
            default:
                windowStart = new Date(referenceTime.getFullYear(), referenceTime.getMonth(), 1);
                windowEnd = new Date(referenceTime.getFullYear(), referenceTime.getMonth() + 1, 1);
        }
        
        return { windowStart, windowEnd };
    }

    /**
     * Acquire distributed scheduler coordination lock
     */
    async acquireSchedulerLock() {
        const expiresAt = new Date(Date.now() + SCHEDULER_LOCK_TTL_SECONDS * 1000);

        try {
            // Cleanup expired locks first
            await db
                .delete(schedulerCoordinationLocks)
                .where(lte(schedulerCoordinationLocks.expiresAt, new Date()));

            // Try to insert lock
            const [lock] = await db
                .insert(schedulerCoordinationLocks)
                .values({
                    lockName: SCHEDULER_LOCK_NAME,
                    holderInstanceId: this.instanceId,
                    expiresAt,
                    metadata: { startedAt: new Date().toISOString() }
                })
                .returning()
                .catch(() => [null]);

            if (lock) {
                this.isLeader = true;
                logger.info(`[Scheduler ${this.instanceId}] Acquired leader lock`);
                return true;
            }

            // Lock exists, check if we already own it
            const [existing] = await db
                .select()
                .from(schedulerCoordinationLocks)
                .where(eq(schedulerCoordinationLocks.lockName, SCHEDULER_LOCK_NAME));

            if (existing?.holderInstanceId === this.instanceId) {
                this.isLeader = true;
                return true;
            }

            this.isLeader = false;
            return false;
        } catch (error) {
            logger.error(`[Scheduler ${this.instanceId}] Error acquiring lock:`, error);
            this.isLeader = false;
            return false;
        }
    }

    /**
     * Heartbeat to maintain scheduler lock
     */
    async maintainLeaderLock() {
        if (!this.isLeader) {
            return;
        }

        try {
            const expiresAt = new Date(Date.now() + SCHEDULER_LOCK_TTL_SECONDS * 1000);

            await db
                .update(schedulerCoordinationLocks)
                .set({ 
                    heartbeatAt: new Date(), 
                    expiresAt 
                })
                .where(
                    and(
                        eq(schedulerCoordinationLocks.lockName, SCHEDULER_LOCK_NAME),
                        eq(schedulerCoordinationLocks.holderInstanceId, this.instanceId)
                    )
                );

            logger.debug(`[Scheduler ${this.instanceId}] Heartbeat sent`);
        } catch (error) {
            logger.error(`[Scheduler ${this.instanceId}] Heartbeat failed:`, error);
            this.isLeader = false;
        }
    }

    /**
     * Release scheduler lock
     */
    async releaseSchedulerLock() {
        try {
            await db
                .delete(schedulerCoordinationLocks)
                .where(
                    and(
                        eq(schedulerCoordinationLocks.lockName, SCHEDULER_LOCK_NAME),
                        eq(schedulerCoordinationLocks.holderInstanceId, this.instanceId)
                    )
                );

            this.isLeader = false;
            logger.info(`[Scheduler ${this.instanceId}] Released leader lock`);
        } catch (error) {
            logger.error(`[Scheduler ${this.instanceId}] Error releasing lock:`, error);
        }
    }

    /**
     * Check if execution already exists (Layer 1: Fingerprint Cache)
     */
    async checkFingerprintCache(fingerprint) {
        const [cached] = await db
            .select()
            .from(recurringPaymentFingerprints)
            .where(
                and(
                    eq(recurringPaymentFingerprints.fingerprint, fingerprint),
                    gte(recurringPaymentFingerprints.expiresAt, new Date())
                )
            );

        if (cached) {
            // Update hit count
            await db
                .update(recurringPaymentFingerprints)
                .set({
                    hitCount: sql`${recurringPaymentFingerprints.hitCount} + 1`,
                    lastHitAt: new Date()
                })
                .where(eq(recurringPaymentFingerprints.id, cached.id));

            logger.debug(`[Scheduler] Fingerprint cache hit: ${fingerprint}`);
            return {
                exists: true,
                cached: true,
                responseCode: cached.cachedResponseCode,
                responseBody: cached.cachedResponseBody
            };
        }

        return { exists: false };
    }

    /**
     * Check if execution already exists (Layer 2: Execution Table)
     */
    async checkExecutionExists({ goalId, windowStart, windowEnd, sourceEventId = null }) {
        const [existing] = await db
            .select()
            .from(recurringPaymentExecutions)
            .where(
                and(
                    eq(recurringPaymentExecutions.goalId, goalId),
                    eq(recurringPaymentExecutions.billingWindowStart, windowStart),
                    eq(recurringPaymentExecutions.billingWindowEnd, windowEnd),
                    sourceEventId 
                        ? eq(recurringPaymentExecutions.sourceEventId, sourceEventId)
                        : isNull(recurringPaymentExecutions.sourceEventId)
                )
            );

        if (existing && ['completed', 'executing', 'pending'].includes(existing.status)) {
            logger.debug(`[Scheduler] Execution exists for goal ${goalId}: ${existing.status}`);
            return {
                exists: true,
                execution: existing
            };
        }

        return { exists: false };
    }

    /**
     * Create execution record with idempotency guarantees
     */
    async createExecution({ goal, windowStart, windowEnd, sourceEventId = null, sourceEventType = 'scheduler' }) {
        const amountCents = Math.round((goal.recurringContribution?.amount || 0) * 100);
        const currency = goal.currency || 'USD';

        // Generate fingerprint
        const fingerprint = this.generateFingerprint({
            goalId: goal.id,
            windowStart,
            windowEnd,
            eventId: sourceEventId,
            amountCents,
            currency
        });

        // Layer 1: Check fingerprint cache
        const cacheResult = await this.checkFingerprintCache(fingerprint);
        if (cacheResult.exists) {
            return {
                created: false,
                reason: 'fingerprint_cache_hit',
                execution: null,
                cachedResponse: cacheResult
            };
        }

        // Layer 2: Check execution table
        const existsResult = await this.checkExecutionExists({
            goalId: goal.id,
            windowStart,
            windowEnd,
            sourceEventId
        });

        if (existsResult.exists) {
            return {
                created: false,
                reason: 'execution_exists',
                execution: existsResult.execution
            };
        }

        // Layer 3: Create execution with unique constraint protection
        try {
            const [execution] = await db
                .insert(recurringPaymentExecutions)
                .values({
                    tenantId: goal.tenantId,
                    goalId: goal.id,
                    userId: goal.userId,
                    billingWindowStart: windowStart,
                    billingWindowEnd: windowEnd,
                    sourceEventId,
                    sourceEventType,
                    executionFingerprint: fingerprint,
                    contributionAmountCents: amountCents,
                    contributionCurrency: currency,
                    status: 'pending',
                    scheduledAt: new Date()
                })
                .returning();

            // Create fingerprint cache entry
            const fingerprintExpiresAt = new Date(Date.now() + FINGERPRINT_TTL_HOURS * 60 * 60 * 1000);
            await db
                .insert(recurringPaymentFingerprints)
                .values({
                    tenantId: goal.tenantId,
                    fingerprint,
                    executionId: execution.id,
                    expiresAt: fingerprintExpiresAt
                })
                .catch(err => {
                    // Fingerprint cache is best-effort, log but don't fail
                    logger.warn(`[Scheduler] Failed to cache fingerprint:`, err);
                });

            logger.info(`[Scheduler] Created execution ${execution.id} for goal ${goal.id}`);
            return {
                created: true,
                execution
            };
        } catch (error) {
            // Unique constraint violation = concurrent duplicate
            if (error.code === '23505') {
                logger.warn(`[Scheduler] Duplicate execution prevented by unique constraint for goal ${goal.id}`);
                return {
                    created: false,
                    reason: 'unique_constraint_violation',
                    execution: null
                };
            }

            throw error;
        }
    }

    /**
     * Scan and schedule recurring payments
     */
    async scanAndSchedule() {
        if (!this.isLeader) {
            logger.debug(`[Scheduler ${this.instanceId}] Not leader, skipping scan`);
            return;
        }

        const scanStart = Date.now();
        logger.info(`[Scheduler ${this.instanceId}] Starting scan for recurring payments`);

        try {
            // Find active goals with recurring contributions
            const activeGoals = await db
                .select()
                .from(goals)
                .where(
                    and(
                        eq(goals.status, 'active'),
                        sql`${goals.recurringContribution}->>'amount' IS NOT NULL`,
                        sql`CAST(${goals.recurringContribution}->>'amount' AS NUMERIC) > 0`
                    )
                );

            logger.info(`[Scheduler] Found ${activeGoals.length} active goals with recurring contributions`);

            const now = new Date();
            const lookaheadTime = new Date(now.getTime() + EXECUTION_LOOKAHEAD_HOURS * 60 * 60 * 1000);

            let scheduled = 0;
            let skipped = 0;

            for (const goal of activeGoals) {
                try {
                    const { windowStart, windowEnd } = this.calculateBillingWindow(goal, now);

                    // Only schedule if window end is within lookahead period
                    if (windowEnd > lookaheadTime) {
                        continue;
                    }

                    const result = await this.createExecution({
                        goal,
                        windowStart,
                        windowEnd,
                        sourceEventType: 'scheduler'
                    });

                    if (result.created) {
                        scheduled++;
                        
                        // Queue for immediate worker processing
                        await this.worker.processExecution(result.execution.id);
                    } else {
                        skipped++;
                        logger.debug(`[Scheduler] Skipped goal ${goal.id}: ${result.reason}`);
                    }
                } catch (error) {
                    logger.error(`[Scheduler] Error processing goal ${goal.id}:`, error);
                }
            }

            const scanDuration = Date.now() - scanStart;
            logger.info(`[Scheduler] Scan complete in ${scanDuration}ms: ${scheduled} scheduled, ${skipped} skipped`);
        } catch (error) {
            logger.error(`[Scheduler] Scan failed:`, error);
        }
    }

    /**
     * Start the scheduler
     */
    async start() {
        logger.info(`[Scheduler ${this.instanceId}] Starting...`);

        // Try to acquire lock
        const acquired = await this.acquireSchedulerLock();
        
        if (!acquired) {
            logger.info(`[Scheduler ${this.instanceId}] Running as standby (no lock acquired)`);
        }

        // Start heartbeat timer
        this.heartbeatTimer = setInterval(() => {
            this.maintainLeaderLock();
        }, SCHEDULER_HEARTBEAT_INTERVAL);

        // Start processing timer (every 60 seconds)
        this.processingTimer = setInterval(() => {
            this.scanAndSchedule();
        }, 60000);

        // Initial scan
        await this.scanAndSchedule();
    }

    /**
     * Stop the scheduler
     */
    async stop() {
        logger.info(`[Scheduler ${this.instanceId}] Stopping...`);

        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        if (this.processingTimer) {
            clearInterval(this.processingTimer);
            this.processingTimer = null;
        }

        await this.releaseSchedulerLock();
        
        logger.info(`[Scheduler ${this.instanceId}] Stopped`);
    }
}

export default RecurringPaymentScheduler;
