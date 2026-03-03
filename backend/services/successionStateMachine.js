import db from '../config/db.js';
import { successionGracePeriods, successionRules, users } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import eventBus from '../events/eventBus.js';
import auditService from './auditService.js';

/**
 * Grace Period State Machine (#676)
 * Manages the deterministic state transitions after critical inactivity detection.
 *
 * States:
 * - active: Normal operation
 * - critical_inactivity: Critical inactivity detected, grace period starts
 * - grace_period: User has time to re-authenticate
 * - transition_triggered: Succession protocol initiated, cannot revert
 * - cancelled: Owner re-authenticated, process cancelled
 */
class SuccessionStateMachine {
    constructor() {
        // State machine configuration
        this.states = {
            ACTIVE: 'active',
            CRITICAL_INACTIVITY: 'critical_inactivity',
            GRACE_PERIOD: 'grace_period',
            TRANSITION_TRIGGERED: 'transition_triggered',
            CANCELLED: 'cancelled'
        };

        // Grace period duration (7 days by default)
        this.gracePeriodDuration = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

        // Valid state transitions
        this.transitions = {
            [this.states.ACTIVE]: [this.states.CRITICAL_INACTIVITY],
            [this.states.CRITICAL_INACTIVITY]: [this.states.GRACE_PERIOD, this.states.CANCELLED],
            [this.states.GRACE_PERIOD]: [this.states.TRANSITION_TRIGGERED, this.states.CANCELLED],
            [this.states.TRANSITION_TRIGGERED]: [], // Terminal state, cannot transition
            [this.states.CANCELLED]: [] // Terminal state, cannot transition
        };

        // Listen for critical inactivity events
        this.setupEventListeners();

        // Start grace period monitoring
        this.startGracePeriodMonitoring();
    }

    /**
     * Set up event listeners for state machine triggers
     */
    setupEventListeners() {
        // Listen for critical inactivity detection
        eventBus.on('CRITICAL_INACTIVITY', async (eventData) => {
            try {
                await this.handleCriticalInactivity(eventData);
            } catch (error) {
                console.error('[SuccessionStateMachine] Failed to handle critical inactivity:', error);
            }
        });

        // Listen for owner re-authentication (potential cancellation trigger)
        eventBus.on('USER_AUTHENTICATED', async (eventData) => {
            try {
                await this.handleUserReauthentication(eventData);
            } catch (error) {
                console.error('[SuccessionStateMachine] Failed to handle user reauthentication:', error);
            }
        });
    }

    /**
     * Handle critical inactivity detection - transition to grace period
     */
    async handleCriticalInactivity(eventData) {
        const { userId, successionRuleId, inactivityScore, daysInactive } = eventData;

        try {
            // Check if there's already an active grace period for this user
            const existingGracePeriod = await this.getActiveGracePeriod(userId);

            if (existingGracePeriod) {
                console.log(`[SuccessionStateMachine] Active grace period already exists for user ${userId}`);
                return;
            }

            // Create new grace period state machine
            const gracePeriodEndsAt = new Date(Date.now() + this.gracePeriodDuration);

            const [newGracePeriod] = await db.insert(successionGracePeriods).values({
                userId,
                successionRuleId,
                currentState: this.states.CRITICAL_INACTIVITY,
                inactivityScore,
                daysInactive,
                triggerEventData: eventData,
                stateHistory: [{
                    state: this.states.CRITICAL_INACTIVITY,
                    timestamp: new Date().toISOString(),
                    reason: 'critical_inactivity_detected'
                }]
            }).returning();

            // Immediately transition to grace period
            await this.transitionState(newGracePeriod.id, this.states.GRACE_PERIOD, {
                reason: 'grace_period_started',
                gracePeriodEndsAt
            });

            // Audit the grace period initiation
            await auditService.logAuditEvent({
                userId,
                action: 'GRACE_PERIOD_INITIATED',
                resourceType: 'succession_grace_period',
                resourceId: newGracePeriod.id,
                metadata: {
                    successionRuleId,
                    inactivityScore,
                    daysInactive,
                    gracePeriodEndsAt: gracePeriodEndsAt.toISOString()
                }
            });

            console.log(`[SuccessionStateMachine] Grace period initiated for user ${userId}, ends at ${gracePeriodEndsAt}`);

        } catch (error) {
            console.error('[SuccessionStateMachine] Failed to handle critical inactivity:', error);
            throw error;
        }
    }

    /**
     * Handle user re-authentication - potentially cancel grace period
     */
    async handleUserReauthentication(eventData) {
        const { userId } = eventData;

        try {
            const activeGracePeriod = await this.getActiveGracePeriod(userId);

            if (activeGracePeriod && activeGracePeriod.currentState === this.states.GRACE_PERIOD) {
                // Cancel the grace period due to owner re-authentication
                await this.transitionState(activeGracePeriod.id, this.states.CANCELLED, {
                    reason: 'owner_reauthenticated',
                    cancelReason: 'owner_reauthenticated'
                });

                console.log(`[SuccessionStateMachine] Grace period cancelled for user ${userId} due to re-authentication`);
            }
        } catch (error) {
            console.error('[SuccessionStateMachine] Failed to handle user reauthentication:', error);
        }
    }

    /**
     * Transition state machine to a new state
     */
    async transitionState(gracePeriodId, newState, metadata = {}) {
        try {
            // Get current state
            const [gracePeriod] = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.id, gracePeriodId));

            if (!gracePeriod) {
                throw new Error(`Grace period ${gracePeriodId} not found`);
            }

            const currentState = gracePeriod.currentState;

            // Validate transition
            if (!this.transitions[currentState].includes(newState)) {
                throw new Error(`Invalid state transition from ${currentState} to ${newState}`);
            }

            // Prepare update data
            const updateData = {
                currentState: newState,
                previousState: currentState,
                stateChangedAt: new Date(),
                stateHistory: [
                    ...gracePeriod.stateHistory,
                    {
                        state: newState,
                        timestamp: new Date().toISOString(),
                        reason: metadata.reason || 'state_transition',
                        ...metadata
                    }
                ],
                updatedAt: new Date()
            };

            // Add state-specific fields
            if (newState === this.states.GRACE_PERIOD) {
                updateData.gracePeriodEndsAt = metadata.gracePeriodEndsAt || new Date(Date.now() + this.gracePeriodDuration);
            } else if (newState === this.states.TRANSITION_TRIGGERED) {
                updateData.transitionTriggeredAt = new Date();
            } else if (newState === this.states.CANCELLED) {
                updateData.cancelledAt = new Date();
                updateData.cancelReason = metadata.cancelReason;
            }

            // Update the grace period
            await db.update(successionGracePeriods)
                .set(updateData)
                .where(eq(successionGracePeriods.id, gracePeriodId));

            // Emit state transition event
            eventBus.emit('GRACE_PERIOD_STATE_CHANGED', {
                gracePeriodId,
                userId: gracePeriod.userId,
                fromState: currentState,
                toState: newState,
                metadata
            });

            // Audit the state transition
            await auditService.logAuditEvent({
                userId: gracePeriod.userId,
                action: 'GRACE_PERIOD_STATE_CHANGED',
                resourceType: 'succession_grace_period',
                resourceId: gracePeriodId,
                metadata: {
                    fromState: currentState,
                    toState: newState,
                    ...metadata
                }
            });

            console.log(`[SuccessionStateMachine] State transitioned: ${currentState} -> ${newState} for grace period ${gracePeriodId}`);

            return { success: true, fromState: currentState, toState: newState };

        } catch (error) {
            console.error('[SuccessionStateMachine] Failed to transition state:', error);
            throw error;
        }
    }

    /**
     * Get active grace period for a user
     */
    async getActiveGracePeriod(userId) {
        try {
            const [gracePeriod] = await db.select()
                .from(successionGracePeriods)
                .where(and(
                    eq(successionGracePeriods.userId, userId),
                    eq(successionGracePeriods.currentState, this.states.GRACE_PERIOD)
                ))
                .orderBy(desc(successionGracePeriods.createdAt))
                .limit(1);

            return gracePeriod || null;
        } catch (error) {
            console.error('[SuccessionStateMachine] Failed to get active grace period:', error);
            return null;
        }
    }

    /**
     * Get grace period status for a user
     */
    async getGracePeriodStatus(userId) {
        try {
            const [gracePeriod] = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.userId, userId))
                .orderBy(desc(successionGracePeriods.createdAt))
                .limit(1);

            if (!gracePeriod) {
                return { userId, status: this.states.ACTIVE };
            }

            const now = new Date();
            const isExpired = gracePeriod.gracePeriodEndsAt && now > gracePeriod.gracePeriodEndsAt;
            const isTerminal = [this.states.TRANSITION_TRIGGERED, this.states.CANCELLED].includes(gracePeriod.currentState);

            return {
                userId,
                gracePeriodId: gracePeriod.id,
                currentState: gracePeriod.currentState,
                previousState: gracePeriod.previousState,
                stateChangedAt: gracePeriod.stateChangedAt,
                gracePeriodEndsAt: gracePeriod.gracePeriodEndsAt,
                isExpired,
                isTerminal,
                timeRemaining: gracePeriod.gracePeriodEndsAt ?
                    Math.max(0, gracePeriod.gracePeriodEndsAt - now) : 0,
                stateHistory: gracePeriod.stateHistory,
                metadata: gracePeriod.metadata
            };
        } catch (error) {
            console.error('[SuccessionStateMachine] Failed to get grace period status:', error);
            throw error;
        }
    }

    /**
     * Manually trigger succession transition (admin override)
     */
    async triggerSuccessionTransition(gracePeriodId, reason = 'manual_override') {
        try {
            const result = await this.transitionState(gracePeriodId, this.states.TRANSITION_TRIGGERED, {
                reason,
                triggeredBy: 'admin_override'
            });

            // Emit succession trigger event
            const [gracePeriod] = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.id, gracePeriodId));

            eventBus.emit('SUCCESSION_TRANSITION_TRIGGERED', {
                userId: gracePeriod.userId,
                gracePeriodId,
                successionRuleId: gracePeriod.successionRuleId,
                reason
            });

            return result;
        } catch (error) {
            console.error('[SuccessionStateMachine] Failed to trigger succession transition:', error);
            throw error;
        }
    }

    /**
     * Cancel grace period manually
     */
    async cancelGracePeriod(gracePeriodId, reason = 'manual_override') {
        try {
            return await this.transitionState(gracePeriodId, this.states.CANCELLED, {
                reason: 'manual_cancellation',
                cancelReason: reason
            });
        } catch (error) {
            console.error('[SuccessionStateMachine] Failed to cancel grace period:', error);
            throw error;
        }
    }

    /**
     * Start monitoring for expired grace periods
     */
    startGracePeriodMonitoring() {
        // Check every hour for expired grace periods
        setInterval(async () => {
            try {
                await this.checkExpiredGracePeriods();
            } catch (error) {
                console.error('[SuccessionStateMachine] Grace period monitoring failed:', error);
            }
        }, 60 * 60 * 1000); // 1 hour

        console.log('[SuccessionStateMachine] Grace period monitoring started (checks every hour)');
    }

    /**
     * Check for expired grace periods and trigger succession
     */
    async checkExpiredGracePeriods() {
        try {
            const now = new Date();

            // Find expired grace periods that haven't been triggered yet
            const expiredGracePeriods = await db.select()
                .from(successionGracePeriods)
                .where(and(
                    eq(successionGracePeriods.currentState, this.states.GRACE_PERIOD),
                    sql`${successionGracePeriods.gracePeriodEndsAt} <= ${now}`
                ));

            for (const gracePeriod of expiredGracePeriods) {
                console.log(`[SuccessionStateMachine] Grace period expired for user ${gracePeriod.userId}, triggering succession`);

                await this.triggerSuccessionTransition(gracePeriod.id, 'grace_period_expired');
            }

            if (expiredGracePeriods.length > 0) {
                console.log(`[SuccessionStateMachine] Processed ${expiredGracePeriods.length} expired grace periods`);
            }
        } catch (error) {
            console.error('[SuccessionStateMachine] Failed to check expired grace periods:', error);
        }
    }

    /**
     * Get grace period history for a user
     */
    async getGracePeriodHistory(userId, limit = 10) {
        try {
            const history = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.userId, userId))
                .orderBy(desc(successionGracePeriods.createdAt))
                .limit(limit);

            return history.map(gp => ({
                id: gp.id,
                successionRuleId: gp.successionRuleId,
                currentState: gp.currentState,
                previousState: gp.previousState,
                stateChangedAt: gp.stateChangedAt,
                gracePeriodEndsAt: gp.gracePeriodEndsAt,
                transitionTriggeredAt: gp.transitionTriggeredAt,
                cancelledAt: gp.cancelledAt,
                cancelReason: gp.cancelReason,
                inactivityScore: gp.inactivityScore,
                daysInactive: gp.daysInactive,
                stateHistory: gp.stateHistory,
                createdAt: gp.createdAt
            }));
        } catch (error) {
            console.error('[SuccessionStateMachine] Failed to get grace period history:', error);
            throw error;
        }
    }
}

export default new SuccessionStateMachine();