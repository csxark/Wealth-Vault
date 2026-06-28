// backend/__tests__/successionHeartbeat.test.js
// Issue #675: Succession Heartbeat Engine Tests

import db from '../config/db.js';
import { userHeartbeats, successionRules } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import successionHeartbeatService from '../services/successionHeartbeatService.js';
import eventBus from '../events/eventBus.js';
import auditService from '../services/auditService.js';

// Mock data
const testUserId = '33333333-3333-3333-3333-333333333333';
const testTenantId = '44444444-4444-4444-4444-444444444444';

const mockRequestInfo = {
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    sessionId: 'session_12345'
};

describe('Succession Heartbeat Engine', () => {
    beforeEach(async () => {
        // Clear any existing heartbeats for test user
        await db.delete(userHeartbeats)
            .where(eq(userHeartbeats.userId, testUserId));

        jest.clearAllMocks();
    });

    afterEach(async () => {
        // Clean up test data
        await db.delete(userHeartbeats)
            .where(eq(userHeartbeats.userId, testUserId));
    });

    describe('Heartbeat Recording', () => {
        it('should record email confirmation heartbeat', async () => {
            const result = await successionHeartbeatService.recordEmailConfirmation(
                testUserId,
                'security_alert',
                mockRequestInfo
            );

            expect(result.success).toBe(true);
            expect(result.weight).toBe(0.3); // Email confirmation weight

            // Verify heartbeat was stored
            const heartbeats = await db.select()
                .from(userHeartbeats)
                .where(eq(userHeartbeats.userId, testUserId));

            expect(heartbeats.length).toBe(1);
            expect(heartbeats[0].channel).toBe('email_confirmation');
            expect(heartbeats[0].metadata.emailType).toBe('security_alert');
        });

        it('should record in-app check-in heartbeat', async () => {
            const result = await successionHeartbeatService.recordInAppCheckin(
                testUserId,
                'login',
                mockRequestInfo
            );

            expect(result.success).toBe(true);
            expect(result.weight).toBe(0.4); // In-app check-in weight

            // Verify heartbeat was stored
            const heartbeats = await db.select()
                .from(userHeartbeats)
                .where(eq(userHeartbeats.userId, testUserId));

            expect(heartbeats.length).toBe(1);
            expect(heartbeats[0].channel).toBe('in_app_checkin');
            expect(heartbeats[0].metadata.checkinType).toBe('login');
        });

        it('should record on-chain activity heartbeat', async () => {
            const txHash = '0x1234567890abcdef';
            const result = await successionHeartbeatService.recordOnChainActivity(
                testUserId,
                txHash,
                'ethereum',
                mockRequestInfo
            );

            expect(result.success).toBe(true);
            expect(result.weight).toBe(0.5); // On-chain activity weight

            // Verify heartbeat was stored
            const heartbeats = await db.select()
                .from(userHeartbeats)
                .where(eq(userHeartbeats.userId, testUserId));

            expect(heartbeats.length).toBe(1);
            expect(heartbeats[0].channel).toBe('on_chain_activity');
            expect(heartbeats[0].metadata.transactionHash).toBe(txHash);
            expect(heartbeats[0].metadata.network).toBe('ethereum');
        });

        it('should reject unknown heartbeat channel', async () => {
            await expect(
                successionHeartbeatService.recordHeartbeat(testUserId, 'unknown_channel')
            ).rejects.toThrow('Unknown heartbeat channel: unknown_channel');
        });
    });

    describe('Inactivity Score Calculation', () => {
        it('should return maximum inactivity score for user with no heartbeats', async () => {
            const score = await successionHeartbeatService.calculateInactivityScore(testUserId);
            expect(score).toBe(1.0);
        });

        it('should calculate weighted inactivity score with recent activity', async () => {
            // Record recent activity across multiple channels
            await successionHeartbeatService.recordEmailConfirmation(testUserId, 'confirmation');
            await successionHeartbeatService.recordInAppCheckin(testUserId, 'login');
            await successionHeartbeatService.recordOnChainActivity(testUserId, '0xhash', 'ethereum');

            const score = await successionHeartbeatService.calculateInactivityScore(testUserId);
            expect(score).toBeGreaterThan(0);
            expect(score).toBeLessThan(0.5); // Should be relatively active
        });

        it('should increase inactivity score with older activity', async () => {
            // Record old activity (simulate by inserting directly with old timestamp)
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 60); // 60 days ago

            await db.insert(userHeartbeats).values({
                userId: testUserId,
                channel: 'in_app_checkin',
                weight: '0.4',
                timestamp: oldDate
            });

            const score = await successionHeartbeatService.calculateInactivityScore(testUserId);
            expect(score).toBeGreaterThan(0.5); // Should show significant inactivity
        });
    });

    describe('Heartbeat Status', () => {
        it('should return active status for user with recent activity', async () => {
            await successionHeartbeatService.recordInAppCheckin(testUserId, 'login');

            const status = await successionHeartbeatService.getHeartbeatStatus(testUserId);

            expect(status.status).toBe('active');
            expect(status.inactivityScore).toBeLessThan(0.5);
            expect(status.latestHeartbeats.in_app_checkin).toBeDefined();
        });

        it('should return warning status for moderately inactive user', async () => {
            // Insert activity 40 days ago
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 40);

            await db.insert(userHeartbeats).values({
                userId: testUserId,
                channel: 'in_app_checkin',
                weight: '0.4',
                timestamp: oldDate
            });

            const status = await successionHeartbeatService.getHeartbeatStatus(testUserId);

            expect(status.status).toBe('warning');
            expect(status.daysInactive).toBeGreaterThan(30);
        });

        it('should return critical status for highly inactive user', async () => {
            // Insert activity 70 days ago
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 70);

            await db.insert(userHeartbeats).values({
                userId: testUserId,
                channel: 'in_app_checkin',
                weight: '0.4',
                timestamp: oldDate
            });

            const status = await successionHeartbeatService.getHeartbeatStatus(testUserId);

            expect(status.status).toBe('critical');
            expect(status.daysInactive).toBeGreaterThan(60);
        });
    });

    describe('Critical Inactivity Detection', () => {
        it('should emit CRITICAL_INACTIVITY event for critical status', async () => {
            // Mock event bus emit
            const emitSpy = jest.spyOn(eventBus, 'emit');

            // Create a succession rule for the test user
            await db.insert(successionRules).values({
                userId: testUserId,
                triggerType: 'inactivity',
                inactivityDays: 60,
                status: 'active',
                distributionPlan: [{ entityId: 'entity1', recipientId: 'recipient1', percentage: 100 }]
            });

            // Insert old activity to trigger critical status
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 70);

            await db.insert(userHeartbeats).values({
                userId: testUserId,
                channel: 'in_app_checkin',
                weight: '0.4',
                timestamp: oldDate
            });

            await successionHeartbeatService.checkCriticalInactivity(testUserId);

            expect(emitSpy).toHaveBeenCalledWith('CRITICAL_INACTIVITY', expect.objectContaining({
                userId: testUserId,
                status: 'critical'
            }));

            // Clean up
            await db.delete(successionRules)
                .where(eq(successionRules.userId, testUserId));
        });

        it('should not emit event for active users', async () => {
            const emitSpy = jest.spyOn(eventBus, 'emit');

            await successionHeartbeatService.recordInAppCheckin(testUserId, 'login');
            await successionHeartbeatService.checkCriticalInactivity(testUserId);

            expect(emitSpy).not.toHaveBeenCalledWith('CRITICAL_INACTIVITY', expect.any(Object));
        });
    });

    describe('Heartbeat History', () => {
        it('should retrieve heartbeat history for user', async () => {
            // Record multiple heartbeats
            await successionHeartbeatService.recordEmailConfirmation(testUserId, 'confirmation');
            await successionHeartbeatService.recordInAppCheckin(testUserId, 'login');
            await successionHeartbeatService.recordOnChainActivity(testUserId, '0xhash', 'ethereum');

            const history = await successionHeartbeatService.getHeartbeatHistory(testUserId, 10);

            expect(history.length).toBe(3);
            expect(history[0].channel).toBe('on_chain_activity'); // Most recent first
            expect(history[1].channel).toBe('in_app_checkin');
            expect(history[2].channel).toBe('email_confirmation');
        });

        it('should limit heartbeat history results', async () => {
            // Record 5 heartbeats
            for (let i = 0; i < 5; i++) {
                await successionHeartbeatService.recordInAppCheckin(testUserId, `checkin_${i}`);
            }

            const history = await successionHeartbeatService.getHeartbeatHistory(testUserId, 3);
            expect(history.length).toBe(3);
        });
    });

    describe('False Trigger Prevention', () => {
        it('should not trigger critical inactivity for users with recent on-chain activity', async () => {
            const emitSpy = jest.spyOn(eventBus, 'emit');

            // Record very old in-app activity but recent on-chain activity
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 100);

            await db.insert(userHeartbeats).values({
                userId: testUserId,
                channel: 'in_app_checkin',
                weight: '0.4',
                timestamp: oldDate
            });

            // Recent on-chain activity (highest weight)
            await successionHeartbeatService.recordOnChainActivity(testUserId, '0xrecent', 'ethereum');

            const status = await successionHeartbeatService.getHeartbeatStatus(testUserId);
            expect(status.status).toBe('active'); // Should be active due to on-chain activity

            await successionHeartbeatService.checkCriticalInactivity(testUserId);
            expect(emitSpy).not.toHaveBeenCalledWith('CRITICAL_INACTIVITY', expect.any(Object));
        });

        it('should handle edge case of mixed activity timestamps', async () => {
            // Email: 10 days ago (low weight)
            const emailDate = new Date();
            emailDate.setDate(emailDate.getDate() - 10);
            await db.insert(userHeartbeats).values({
                userId: testUserId,
                channel: 'email_confirmation',
                weight: '0.3',
                timestamp: emailDate
            });

            // In-app: 80 days ago (medium weight)
            const appDate = new Date();
            appDate.setDate(appDate.getDate() - 80);
            await db.insert(userHeartbeats).values({
                userId: testUserId,
                channel: 'in_app_checkin',
                weight: '0.4',
                timestamp: appDate
            });

            // On-chain: 5 days ago (high weight)
            await successionHeartbeatService.recordOnChainActivity(testUserId, '0xrecent', 'ethereum');

            const status = await successionHeartbeatService.getHeartbeatStatus(testUserId);
            expect(status.status).toBe('active'); // Should be active due to recent high-weight activity
        });
    });
});