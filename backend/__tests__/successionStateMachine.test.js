// backend/__tests__/successionStateMachine.test.js
// Issue #676: Grace Period State Machine Tests

import db from '../config/db.js';
import { successionGracePeriods, successionRules } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import successionStateMachine from '../services/successionStateMachine.js';
import eventBus from '../events/eventBus.js';
import auditService from '../services/auditService.js';

// Mock data
const testUserId = '33333333-3333-3333-3333-333333333333';
const testSuccessionRuleId = '44444444-4444-4444-4444-444444444444';

const mockCriticalInactivityEvent = {
    userId: testUserId,
    successionRuleId: testSuccessionRuleId,
    inactivityScore: 0.85,
    daysInactive: 70,
    status: 'critical',
    latestHeartbeats: {}
};

const mockUserAuthenticatedEvent = {
    userId: testUserId,
    method: 'password'
};

describe('Grace Period State Machine', () => {
    beforeEach(async () => {
        // Clear any existing grace periods for test user
        await db.delete(successionGracePeriods)
            .where(eq(successionGracePeriods.userId, testUserId));

        jest.clearAllMocks();
    });

    afterEach(async () => {
        // Clean up test data
        await db.delete(successionGracePeriods)
            .where(eq(successionGracePeriods.userId, testUserId));
    });

    describe('State Machine Initialization', () => {
        it('should initialize with correct states and transitions', () => {
            expect(successionStateMachine.states).toEqual({
                ACTIVE: 'active',
                CRITICAL_INACTIVITY: 'critical_inactivity',
                GRACE_PERIOD: 'grace_period',
                TRANSITION_TRIGGERED: 'transition_triggered',
                CANCELLED: 'cancelled'
            });

            expect(successionStateMachine.transitions).toBeDefined();
        });

        it('should have valid state transitions', () => {
            const { transitions, states } = successionStateMachine;

            expect(transitions[states.ACTIVE]).toEqual([states.CRITICAL_INACTIVITY]);
            expect(transitions[states.CRITICAL_INACTIVITY]).toEqual([states.GRACE_PERIOD, states.CANCELLED]);
            expect(transitions[states.GRACE_PERIOD]).toEqual([states.TRANSITION_TRIGGERED, states.CANCELLED]);
            expect(transitions[states.TRANSITION_TRIGGERED]).toEqual([]);
            expect(transitions[states.CANCELLED]).toEqual([]);
        });
    });

    describe('Critical Inactivity Handling', () => {
        it('should create grace period when critical inactivity is detected', async () => {
            // Mock event bus emit
            const emitSpy = jest.spyOn(eventBus, 'emit');

            await successionStateMachine.handleCriticalInactivity(mockCriticalInactivityEvent);

            // Verify grace period was created
            const gracePeriods = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.userId, testUserId));

            expect(gracePeriods.length).toBe(1);
            const gracePeriod = gracePeriods[0];
            expect(gracePeriod.currentState).toBe('grace_period');
            expect(gracePeriod.previousState).toBe('critical_inactivity');
            expect(gracePeriod.inactivityScore).toBe(0.85);
            expect(gracePeriod.daysInactive).toBe(70);
            expect(gracePeriod.gracePeriodEndsAt).toBeDefined();

            // Verify events were emitted
            expect(emitSpy).toHaveBeenCalledWith('GRACE_PERIOD_STATE_CHANGED', expect.any(Object));
        });

        it('should not create duplicate grace periods for same user', async () => {
            // Create first grace period
            await successionStateMachine.handleCriticalInactivity(mockCriticalInactivityEvent);

            // Try to create another one
            await successionStateMachine.handleCriticalInactivity(mockCriticalInactivityEvent);

            // Should still only have one grace period
            const gracePeriods = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.userId, testUserId));

            expect(gracePeriods.length).toBe(1);
        });
    });

    describe('State Transitions', () => {
        let gracePeriodId;

        beforeEach(async () => {
            // Create a grace period for testing
            await successionStateMachine.handleCriticalInactivity(mockCriticalInactivityEvent);

            const [gracePeriod] = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.userId, testUserId));

            gracePeriodId = gracePeriod.id;
        });

        it('should allow valid state transitions', async () => {
            const emitSpy = jest.spyOn(eventBus, 'emit');

            // Transition from grace_period to cancelled
            const result = await successionStateMachine.transitionState(
                gracePeriodId,
                successionStateMachine.states.CANCELLED,
                { reason: 'test_cancellation' }
            );

            expect(result.success).toBe(true);
            expect(result.fromState).toBe('grace_period');
            expect(result.toState).toBe('cancelled');

            // Verify state was updated
            const [updated] = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.id, gracePeriodId));

            expect(updated.currentState).toBe('cancelled');
            expect(updated.previousState).toBe('grace_period');
            expect(updated.cancelledAt).toBeDefined();
            expect(updated.cancelReason).toBe('test_cancellation');

            // Verify event was emitted
            expect(emitSpy).toHaveBeenCalledWith('GRACE_PERIOD_STATE_CHANGED', expect.any(Object));
        });

        it('should reject invalid state transitions', async () => {
            // Try to transition from grace_period to active (invalid)
            await expect(
                successionStateMachine.transitionState(
                    gracePeriodId,
                    successionStateMachine.states.ACTIVE,
                    { reason: 'invalid_transition' }
                )
            ).rejects.toThrow('Invalid state transition from grace_period to active');
        });

        it('should prevent transitions from terminal states', async () => {
            // First cancel the grace period
            await successionStateMachine.transitionState(
                gracePeriodId,
                successionStateMachine.states.CANCELLED,
                { reason: 'terminal_test' }
            );

            // Try to transition from cancelled (terminal state)
            await expect(
                successionStateMachine.transitionState(
                    gracePeriodId,
                    successionStateMachine.states.GRACE_PERIOD,
                    { reason: 'should_fail' }
                )
            ).rejects.toThrow('Invalid state transition from cancelled to grace_period');
        });
    });

    describe('User Re-authentication Handling', () => {
        it('should cancel grace period when user re-authenticates', async () => {
            // Create grace period
            await successionStateMachine.handleCriticalInactivity(mockCriticalInactivityEvent);

            // Simulate user re-authentication
            await successionStateMachine.handleUserReauthentication(mockUserAuthenticatedEvent);

            // Verify grace period was cancelled
            const [gracePeriod] = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.userId, testUserId));

            expect(gracePeriod.currentState).toBe('cancelled');
            expect(gracePeriod.cancelReason).toBe('owner_reauthenticated');
        });

        it('should not cancel grace period if user is not in grace period', async () => {
            // Create grace period and immediately cancel it
            await successionStateMachine.handleCriticalInactivity(mockCriticalInactivityEvent);

            let [gracePeriod] = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.userId, testUserId));

            await successionStateMachine.transitionState(
                gracePeriod.id,
                successionStateMachine.states.TRANSITION_TRIGGERED,
                { reason: 'test' }
            );

            // Now try to cancel via re-authentication (should not work from terminal state)
            await successionStateMachine.handleUserReauthentication(mockUserAuthenticatedEvent);

            [gracePeriod] = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.userId, testUserId));

            expect(gracePeriod.currentState).toBe('transition_triggered');
        });
    });

    describe('Grace Period Status', () => {
        it('should return active status for user without grace period', async () => {
            const status = await successionStateMachine.getGracePeriodStatus(testUserId);

            expect(status.userId).toBe(testUserId);
            expect(status.status).toBe('active');
            expect(status.gracePeriodId).toBeUndefined();
        });

        it('should return correct status for user in grace period', async () => {
            await successionStateMachine.handleCriticalInactivity(mockCriticalInactivityEvent);

            const status = await successionStateMachine.getGracePeriodStatus(testUserId);

            expect(status.currentState).toBe('grace_period');
            expect(status.gracePeriodId).toBeDefined();
            expect(status.gracePeriodEndsAt).toBeDefined();
            expect(status.isExpired).toBe(false);
            expect(status.isTerminal).toBe(false);
            expect(status.timeRemaining).toBeGreaterThan(0);
        });

        it('should detect expired grace periods', async () => {
            // Create grace period with past end date
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1); // 1 day ago

            await db.insert(successionGracePeriods).values({
                userId: testUserId,
                successionRuleId: testSuccessionRuleId,
                currentState: 'grace_period',
                gracePeriodEndsAt: pastDate,
                stateHistory: []
            });

            const status = await successionStateMachine.getGracePeriodStatus(testUserId);

            expect(status.isExpired).toBe(true);
            expect(status.timeRemaining).toBe(0);
        });
    });

    describe('Manual Operations', () => {
        let gracePeriodId;

        beforeEach(async () => {
            await successionStateMachine.handleCriticalInactivity(mockCriticalInactivityEvent);

            const [gracePeriod] = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.userId, testUserId));

            gracePeriodId = gracePeriod.id;
        });

        it('should allow manual succession transition trigger', async () => {
            const emitSpy = jest.spyOn(eventBus, 'emit');

            const result = await successionStateMachine.triggerSuccessionTransition(
                gracePeriodId,
                'admin_override'
            );

            expect(result.success).toBe(true);
            expect(result.toState).toBe('transition_triggered');

            // Verify state was updated
            const [updated] = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.id, gracePeriodId));

            expect(updated.currentState).toBe('transition_triggered');
            expect(updated.transitionTriggeredAt).toBeDefined();

            // Verify succession trigger event was emitted
            expect(emitSpy).toHaveBeenCalledWith('SUCCESSION_TRANSITION_TRIGGERED', expect.any(Object));
        });

        it('should allow manual grace period cancellation', async () => {
            const result = await successionStateMachine.cancelGracePeriod(
                gracePeriodId,
                'admin_override'
            );

            expect(result.success).toBe(true);
            expect(result.toState).toBe('cancelled');

            // Verify state was updated
            const [updated] = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.id, gracePeriodId));

            expect(updated.currentState).toBe('cancelled');
            expect(updated.cancelReason).toBe('admin_override');
        });
    });

    describe('Grace Period History', () => {
        it('should retrieve grace period history for user', async () => {
            // Create multiple grace periods
            await successionStateMachine.handleCriticalInactivity(mockCriticalInactivityEvent);

            // Create another one (simulate multiple periods)
            const secondEvent = { ...mockCriticalInactivityEvent };
            await successionStateMachine.handleCriticalInactivity(secondEvent);

            const history = await successionStateMachine.getGracePeriodHistory(testUserId, 5);

            expect(history.length).toBeGreaterThan(0);
            expect(history[0].userId).toBe(testUserId);
            expect(history[0].currentState).toBe('grace_period');
            expect(history[0].stateHistory).toBeDefined();
        });

        it('should limit history results', async () => {
            // Create multiple grace periods
            for (let i = 0; i < 3; i++) {
                await successionStateMachine.handleCriticalInactivity(mockCriticalInactivityEvent);
            }

            const history = await successionStateMachine.getGracePeriodHistory(testUserId, 2);
            expect(history.length).toBe(2);
        });
    });

    describe('Expired Grace Period Monitoring', () => {
        it('should trigger succession for expired grace periods', async () => {
            // Create grace period with past end date
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1);

            await db.insert(successionGracePeriods).values({
                userId: testUserId,
                successionRuleId: testSuccessionRuleId,
                currentState: 'grace_period',
                gracePeriodEndsAt: pastDate,
                stateHistory: []
            });

            const emitSpy = jest.spyOn(eventBus, 'emit');

            await successionStateMachine.checkExpiredGracePeriods();

            // Verify succession was triggered
            const [gracePeriod] = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.userId, testUserId));

            expect(gracePeriod.currentState).toBe('transition_triggered');
            expect(emitSpy).toHaveBeenCalledWith('SUCCESSION_TRANSITION_TRIGGERED', expect.any(Object));
        });

        it('should not trigger succession for non-expired grace periods', async () => {
            await successionStateMachine.handleCriticalInactivity(mockCriticalInactivityEvent);

            await successionStateMachine.checkExpiredGracePeriods();

            // Verify still in grace period
            const [gracePeriod] = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.userId, testUserId));

            expect(gracePeriod.currentState).toBe('grace_period');
        });
    });

    describe('Event Integration', () => {
        it('should listen for CRITICAL_INACTIVITY events', async () => {
            const emitSpy = jest.spyOn(eventBus, 'emit');

            // Emit critical inactivity event
            eventBus.emit('CRITICAL_INACTIVITY', mockCriticalInactivityEvent);

            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify grace period was created
            const gracePeriods = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.userId, testUserId));

            expect(gracePeriods.length).toBe(1);
            expect(emitSpy).toHaveBeenCalledWith('GRACE_PERIOD_STATE_CHANGED', expect.any(Object));
        });

        it('should listen for USER_AUTHENTICATED events', async () => {
            // Create grace period first
            await successionStateMachine.handleCriticalInactivity(mockCriticalInactivityEvent);

            // Emit user authentication event
            eventBus.emit('USER_AUTHENTICATED', mockUserAuthenticatedEvent);

            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify grace period was cancelled
            const [gracePeriod] = await db.select()
                .from(successionGracePeriods)
                .where(eq(successionGracePeriods.userId, testUserId));

            expect(gracePeriod.currentState).toBe('cancelled');
        });
    });
});