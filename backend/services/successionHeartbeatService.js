import db from '../config/db.js';
import { userHeartbeats, users, successionRules } from '../db/schema.js';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import eventBus from '../events/eventBus.js';
import auditService from './auditService.js';

/**
 * Succession Heartbeat Engine (#675)
 * Monitors user liveness across multiple independent channels and computes
 * weighted inactivity scores to detect potential succession triggers.
 */
class SuccessionHeartbeatService {
    constructor() {
        // Channel weights for inactivity score calculation
        this.channelWeights = {
            email_confirmation: 0.3,    // Email responses are reliable but not frequent
            in_app_checkin: 0.4,        // Direct app interaction is strong signal
            on_chain_activity: 0.5,     // Blockchain transactions are definitive proof of life
            hardware_wallet: 0.6        // Hardware wallet activity is highest trust
        };

        // Inactivity thresholds (in days)
        this.inactivityThresholds = {
            warning: 30,      // Start monitoring closely
            critical: 60,     // Trigger succession protocol
            emergency: 90     // Immediate action required
        };

        // Start the monitoring job
        this.startMonitoring();
    }

    /**
     * Record a heartbeat from a specific channel
     */
    async recordHeartbeat(userId, channel, metadata = {}, requestInfo = {}) {
        try {
            if (!this.channelWeights[channel]) {
                throw new Error(`Unknown heartbeat channel: ${channel}`);
            }

            const weight = this.channelWeights[channel];

            await db.insert(userHeartbeats).values({
                userId,
                channel,
                weight: weight, // Store as number, not string
                metadata,
                ipAddress: requestInfo.ipAddress,
                userAgent: requestInfo.userAgent,
                timestamp: new Date()
            });

            // Update user's last activity timestamp
            await db.update(users)
                .set({ updatedAt: new Date() })
                .where(eq(users.id, userId));

            // Audit the heartbeat
            await auditService.logAuditEvent({
                userId,
                action: 'HEARTBEAT_RECORDED',
                resourceType: 'user',
                resourceId: userId,
                metadata: {
                    channel,
                    weight,
                    ...metadata
                }
            });

            console.log(`[SuccessionHeartbeat] Recorded ${channel} heartbeat for user ${userId}`);

            return { success: true, weight };
        } catch (error) {
            console.error('[SuccessionHeartbeat] Failed to record heartbeat:', error);
            throw error;
        }
    }

    /**
     * Record email confirmation heartbeat
     */
    async recordEmailConfirmation(userId, emailType, requestInfo = {}) {
        return this.recordHeartbeat(userId, 'email_confirmation', {
            emailType,
            confirmedAt: new Date().toISOString()
        }, requestInfo);
    }

    /**
     * Record in-app check-in heartbeat
     */
    async recordInAppCheckin(userId, checkinType = 'manual', requestInfo = {}) {
        return this.recordHeartbeat(userId, 'in_app_checkin', {
            checkinType,
            sessionId: requestInfo.sessionId
        }, requestInfo);
    }

    /**
     * Record on-chain activity heartbeat
     */
    async recordOnChainActivity(userId, transactionHash, network = 'ethereum', requestInfo = {}) {
        return this.recordHeartbeat(userId, 'on_chain_activity', {
            transactionHash,
            network,
            blockTimestamp: new Date().toISOString()
        }, requestInfo);
    }

    /**
     * Record hardware wallet heartbeat (future implementation)
     */
    async recordHardwareWalletHeartbeat(userId, deviceId, signature, requestInfo = {}) {
        return this.recordHeartbeat(userId, 'hardware_wallet', {
            deviceId,
            signature,
            verifiedAt: new Date().toISOString()
        }, requestInfo);
    }

    /**
     * Calculate weighted inactivity score for a user
     * Returns a score between 0 (highly active) and 1 (completely inactive)
     */
    async calculateInactivityScore(userId) {
        try {
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
            const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));

            // Get all heartbeats in the last 90 days
            const heartbeats = await db.select()
                .from(userHeartbeats)
                .where(and(
                    eq(userHeartbeats.userId, userId),
                    gte(userHeartbeats.timestamp, ninetyDaysAgo)
                ))
                .orderBy(desc(userHeartbeats.timestamp));

            if (heartbeats.length === 0) {
                return 1.0; // No activity = maximum inactivity
            }

            // Calculate weighted activity score
            let totalWeightedActivity = 0;
            let totalPossibleWeight = 0;

            // Group heartbeats by channel and get the most recent for each
            const latestByChannel = {};
            heartbeats.forEach(hb => {
                if (!latestByChannel[hb.channel] ||
                    new Date(hb.timestamp) > new Date(latestByChannel[hb.channel].timestamp)) {
                    latestByChannel[hb.channel] = hb;
                }
            });

            // Calculate score for each channel
            Object.keys(this.channelWeights).forEach(channel => {
                const weight = this.channelWeights[channel];
                totalPossibleWeight += weight;

                if (latestByChannel[channel]) {
                    const heartbeat = latestByChannel[channel];
                    const daysSinceActivity = (now - new Date(heartbeat.timestamp)) / (1000 * 60 * 60 * 24);

                    // Activity score decays over time (0-1, where 1 is recent activity)
                    let activityScore = 1.0;
                    if (daysSinceActivity > 7) {
                        activityScore = Math.max(0, 1 - (daysSinceActivity - 7) / 83); // Linear decay over 90 days
                    }

                    totalWeightedActivity += weight * activityScore;
                }
                // If no activity in this channel, it contributes 0 to the weighted activity
            });

            // Calculate final inactivity score (0 = active, 1 = inactive)
            const inactivityScore = totalPossibleWeight > 0 ?
                1 - (totalWeightedActivity / totalPossibleWeight) : 1.0;

            return Math.max(0, Math.min(1, inactivityScore));
        } catch (error) {
            console.error('[SuccessionHeartbeat] Failed to calculate inactivity score:', error);
            return 1.0; // Default to maximum inactivity on error
        }
    }

    /**
     * Get user's heartbeat status and inactivity analysis
     */
    async getHeartbeatStatus(userId) {
        try {
            const inactivityScore = await this.calculateInactivityScore(userId);
            const now = new Date();

            // Get latest heartbeats by channel
            const latestHeartbeats = {};
            Object.keys(this.channelWeights).forEach(async channel => {
                const [heartbeat] = await db.select()
                    .from(userHeartbeats)
                    .where(and(
                        eq(userHeartbeats.userId, userId),
                        eq(userHeartbeats.channel, channel)
                    ))
                    .orderBy(desc(userHeartbeats.timestamp))
                    .limit(1);

                if (heartbeat) {
                    const daysSince = (now - new Date(heartbeat.timestamp)) / (1000 * 60 * 60 * 24);
                    latestHeartbeats[channel] = {
                        timestamp: heartbeat.timestamp,
                        daysSince: Math.round(daysSince * 10) / 10,
                        weight: parseFloat(heartbeat.weight) // Already numeric, but ensure it's a number
                    };
                }
            });

            // Determine status level
            let status = 'active';
            let daysInactive = 0;

            if (latestHeartbeats.in_app_checkin || latestHeartbeats.on_chain_activity || latestHeartbeats.hardware_wallet) {
                const mostRecent = Math.min(
                    ...(Object.values(latestHeartbeats).map(hb => hb.daysSince).filter(d => d !== undefined))
                );
                daysInactive = mostRecent;

                if (daysInactive > this.inactivityThresholds.emergency) {
                    status = 'emergency';
                } else if (daysInactive > this.inactivityThresholds.critical) {
                    status = 'critical';
                } else if (daysInactive > this.inactivityThresholds.warning) {
                    status = 'warning';
                }
            } else {
                status = 'unknown'; // No reliable activity signals
            }

            return {
                userId,
                inactivityScore: Math.round(inactivityScore * 100) / 100,
                status,
                daysInactive: Math.round(daysInactive),
                latestHeartbeats,
                thresholds: this.inactivityThresholds,
                calculatedAt: now.toISOString()
            };
        } catch (error) {
            console.error('[SuccessionHeartbeat] Failed to get heartbeat status:', error);
            throw error;
        }
    }

    /**
     * Check for critical inactivity and emit events
     */
    async checkCriticalInactivity(userId) {
        try {
            const status = await this.getHeartbeatStatus(userId);

            if (status.status === 'critical' || status.status === 'emergency') {
                // Check if succession rules exist
                const [rule] = await db.select()
                    .from(successionRules)
                    .where(and(
                        eq(successionRules.userId, userId),
                        eq(successionRules.status, 'active')
                    ));

                if (rule) {
                    // Emit critical inactivity event
                    eventBus.emit('CRITICAL_INACTIVITY', {
                        userId,
                        inactivityScore: status.inactivityScore,
                        daysInactive: status.daysInactive,
                        status: status.status,
                        successionRuleId: rule.id,
                        latestHeartbeats: status.latestHeartbeats
                    });

                    // Audit the critical inactivity detection
                    await auditService.logAuditEvent({
                        userId,
                        action: 'CRITICAL_INACTIVITY_DETECTED',
                        resourceType: 'user',
                        resourceId: userId,
                        metadata: {
                            inactivityScore: status.inactivityScore,
                            daysInactive: status.daysInactive,
                            status: status.status
                        }
                    });

                    console.log(`[SuccessionHeartbeat] CRITICAL INACTIVITY detected for user ${userId}: ${status.status}`);
                }
            }

            return status;
        } catch (error) {
            console.error('[SuccessionHeartbeat] Failed to check critical inactivity:', error);
            throw error;
        }
    }

    /**
     * Start the monitoring job that periodically checks for inactivity
     */
    startMonitoring() {
        // Check every 6 hours
        setInterval(async () => {
            try {
                console.log('[SuccessionHeartbeat] Running inactivity monitoring check...');

                // Get all users with active succession rules
                const usersWithRules = await db.select({
                    userId: successionRules.userId
                })
                .from(successionRules)
                .where(eq(successionRules.status, 'active'));

                const uniqueUserIds = [...new Set(usersWithRules.map(r => r.userId))];

                for (const userId of uniqueUserIds) {
                    await this.checkCriticalInactivity(userId);
                }

                console.log(`[SuccessionHeartbeat] Checked ${uniqueUserIds.length} users for inactivity`);
            } catch (error) {
                console.error('[SuccessionHeartbeat] Monitoring job failed:', error);
            }
        }, 6 * 60 * 60 * 1000); // 6 hours

        console.log('[SuccessionHeartbeat] Monitoring job started (checks every 6 hours)');
    }

    /**
     * Get heartbeat history for a user
     */
    async getHeartbeatHistory(userId, limit = 50) {
        try {
            const heartbeats = await db.select()
                .from(userHeartbeats)
                .where(eq(userHeartbeats.userId, userId))
                .orderBy(desc(userHeartbeats.timestamp))
                .limit(limit);

            return heartbeats.map(hb => ({
                id: hb.id,
                channel: hb.channel,
                timestamp: hb.timestamp,
                weight: parseFloat(hb.weight), // Ensure it's a number
                metadata: hb.metadata,
                ipAddress: hb.ipAddress,
                userAgent: hb.userAgent
            }));
        } catch (error) {
            console.error('[SuccessionHeartbeat] Failed to get heartbeat history:', error);
            throw error;
        }
    }
}

export default new SuccessionHeartbeatService();