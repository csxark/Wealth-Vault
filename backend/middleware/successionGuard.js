import db from '../config/db.js';
import {
    users,
    userHeartbeats,
    successionRules,
    digitalWillDefinitions,
    accessShards,
    auditLogs,
    userSessions
} from '../db/schema.js';
import { eq, and, desc, sql, gte, lte, count } from 'drizzle-orm';
import auditService from '../services/auditService.js';
import notificationService from '../services/notificationService.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';
import ApiResponse from '../utils/ApiResponse.js';

/**
 * Anti-Abuse & False Trigger Protection Layer (#680)
 * Implements safeguards preventing malicious triggering of succession flow
 *
 * Prevents:
 * - Account takeover false inactivity
 * - Heartbeat spoofing
 * - Premature shard distribution
 *
 * Features:
 * - MFA requirement before final transition
 * - Geo-anomaly detection
 * - Cooldown before inactivity escalation
 * - Manual emergency override option
 */
class SuccessionGuard {
    constructor() {
        // Security thresholds
        this.thresholds = {
            geoAnomalyDistance: 500, // km - flag logins >500km from last known location
            heartbeatSpoofThreshold: 10, // suspicious if >10 heartbeats in 1 minute
            cooldownPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days before escalation
            mfaGracePeriod: 24 * 60 * 60 * 1000, // 24 hours for MFA verification
            emergencyOverrideWindow: 72 * 60 * 60 * 1000, // 72 hours for manual override
            suspiciousActivityThreshold: 5 // flag after 5 suspicious events
        };

        // Risk levels
        this.riskLevels = {
            LOW: 'low',
            MEDIUM: 'medium',
            HIGH: 'high',
            CRITICAL: 'critical'
        };

        // Initialize monitoring
        this.activeOverrides = new Map(); // userId -> override expiry
        this.suspiciousActivity = new Map(); // userId -> suspicious event count
    }

    /**
     * Main middleware function - Anti-Abuse Protection Layer
     */
    middleware = async (req, res, next) => {
        const userId = req.user?.id;
        const endpoint = req.originalUrl;
        const method = req.method;

        try {
            // Skip protection for non-sensitive endpoints
            if (this.isLowRiskEndpoint(endpoint, method)) {
                return next();
            }

            logInfo(`[SuccessionGuard] Checking protection for ${method} ${endpoint} by user ${userId}`);

            // 1. Check for emergency override
            if (await this.checkEmergencyOverride(userId)) {
                logInfo(`[SuccessionGuard] Emergency override active for user ${userId}`);
                await this.auditOverrideUsage(userId, endpoint, 'emergency_override');
                return next();
            }

            // 2. Geo-anomaly detection
            const geoRisk = await this.detectGeoAnomaly(userId, req);
            if (geoRisk.level === this.riskLevels.CRITICAL) {
                return this.handleCriticalRisk(res, 'GEO_ANOMALY_DETECTED', geoRisk);
            }

            // 3. Heartbeat spoofing detection
            const spoofRisk = await this.detectHeartbeatSpoofing(userId, req);
            if (spoofRisk.level === this.riskLevels.CRITICAL) {
                return this.handleCriticalRisk(res, 'HEARTBEAT_SPOOFING_DETECTED', spoofRisk);
            }

            // 4. Account takeover detection
            const takeoverRisk = await this.detectAccountTakeover(userId, req);
            if (takeoverRisk.level === this.riskLevels.CRITICAL) {
                return this.handleCriticalRisk(res, 'ACCOUNT_TAKEOVER_SUSPECTED', takeoverRisk);
            }

            // 5. Check cooldown periods for succession operations
            if (this.isSuccessionEndpoint(endpoint)) {
                const cooldownCheck = await this.checkCooldownPeriod(userId);
                if (!cooldownCheck.allowed) {
                    return this.handleCooldownViolation(res, cooldownCheck);
                }
            }

            // 6. MFA requirement for critical operations
            if (this.isCriticalSuccessionEndpoint(endpoint)) {
                const mfaCheck = await this.checkMFARequirement(userId, req);
                if (!mfaCheck.verified) {
                    return this.handleMFARequired(res, mfaCheck);
                }
            }

            // 7. Escalation monitoring
            await this.monitorEscalationRisk(userId, endpoint, geoRisk, spoofRisk, takeoverRisk);

            // 8. Log successful access
            await this.auditSuccessfulAccess(userId, endpoint, method, req);

            next();

        } catch (error) {
            logError(`[SuccessionGuard] Error in protection layer:`, error);
            await this.auditProtectionFailure(userId, endpoint, error);
            next(error);
        }
    };

    /**
     * Check if endpoint is low-risk (skip heavy protection)
     */
    isLowRiskEndpoint(endpoint, method) {
        const lowRiskPatterns = [
            /^\/api\/succession\/will$/,
            /^\/api\/succession\/verify-identity$/,
            /^\/api\/succession\/ledger\/generate\//,
            /^\/api\/succession\/ledger\/export\//
        ];

        // GET requests are generally lower risk
        if (method === 'GET') return true;

        return lowRiskPatterns.some(pattern => pattern.test(endpoint));
    }

    /**
     * Check if endpoint involves succession operations
     */
    isSuccessionEndpoint(endpoint) {
        return endpoint.includes('/succession/') ||
               endpoint.includes('/consensus/') ||
               endpoint.includes('/trustee/');
    }

    /**
     * Check if endpoint is critical (requires MFA)
     */
    isCriticalSuccessionEndpoint(endpoint) {
        const criticalPatterns = [
            /\/consensus\/approve/,
            /\/trustee\/vote/,
            /\/claim\//
        ];

        return criticalPatterns.some(pattern => pattern.test(endpoint));
    }

    /**
     * Check for active emergency override
     */
    async checkEmergencyOverride(userId) {
        const override = this.activeOverrides.get(userId);
        if (!override) return false;

        const now = new Date();
        if (now > override.expiry) {
            this.activeOverrides.delete(userId);
            return false;
        }

        return true;
    }

    /**
     * Detect geographical anomalies in user activity
     */
    async detectGeoAnomaly(userId, req) {
        try {
            // Get user's recent sessions and heartbeats
            const recentActivity = await db.select({
                ipAddress: userHeartbeats.ipAddress,
                timestamp: userHeartbeats.timestamp,
                metadata: userHeartbeats.metadata
            })
            .from(userHeartbeats)
            .where(and(
                eq(userHeartbeats.userId, userId),
                gte(userHeartbeats.timestamp, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) // Last 30 days
            ))
            .orderBy(desc(userHeartbeats.timestamp))
            .limit(10);

            if (recentActivity.length < 2) {
                return { level: this.riskLevels.LOW, reason: 'insufficient_history' };
            }

            const currentIP = req.ip || req.connection.remoteAddress;
            const lastKnownIP = recentActivity[0].ipAddress;

            // Simple IP change detection (in production, use GeoIP database)
            if (currentIP !== lastKnownIP) {
                // Check frequency of IP changes
                const uniqueIPs = [...new Set(recentActivity.map(h => h.ipAddress))];

                if (uniqueIPs.length > 3) {
                    return {
                        level: this.riskLevels.HIGH,
                        reason: 'frequent_ip_changes',
                        details: { uniqueIPs: uniqueIPs.length, currentIP, lastKnownIP }
                    };
                }

                return {
                    level: this.riskLevels.MEDIUM,
                    reason: 'ip_change_detected',
                    details: { currentIP, lastKnownIP }
                };
            }

            return { level: this.riskLevels.LOW, reason: 'normal_activity' };

        } catch (error) {
            logError(`[SuccessionGuard] Geo-anomaly detection error:`, error);
            return { level: this.riskLevels.MEDIUM, reason: 'detection_error' };
        }
    }

    /**
     * Detect potential heartbeat spoofing
     */
    async detectHeartbeatSpoofing(userId, req) {
        try {
            const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

            // Count heartbeats in the last minute
            const recentHeartbeats = await db.select({ count: count() })
                .from(userHeartbeats)
                .where(and(
                    eq(userHeartbeats.userId, userId),
                    gte(userHeartbeats.timestamp, oneMinuteAgo)
                ));

            const heartbeatCount = recentHeartbeats[0]?.count || 0;

            if (heartbeatCount > this.thresholds.heartbeatSpoofThreshold) {
                return {
                    level: this.riskLevels.CRITICAL,
                    reason: 'excessive_heartbeats',
                    details: { count: heartbeatCount, threshold: this.thresholds.heartbeatSpoofThreshold }
                };
            }

            // Check for suspicious patterns (same IP, different user agents rapidly)
            const recentDetailed = await db.select({
                userAgent: userHeartbeats.userAgent,
                ipAddress: userHeartbeats.ipAddress,
                timestamp: userHeartbeats.timestamp
            })
            .from(userHeartbeats)
            .where(and(
                eq(userHeartbeats.userId, userId),
                gte(userHeartbeats.timestamp, oneMinuteAgo)
            ))
            .orderBy(desc(userHeartbeats.timestamp))
            .limit(5);

            const uniqueUserAgents = [...new Set(recentDetailed.map(h => h.userAgent))];
            if (heartbeatCount >= 3 && uniqueUserAgents.length >= 3) {
                return {
                    level: this.riskLevels.HIGH,
                    reason: 'suspicious_user_agent_rotation',
                    details: { uniqueAgents: uniqueUserAgents.length, heartbeats: heartbeatCount }
                };
            }

            return { level: this.riskLevels.LOW, reason: 'normal_heartbeat_pattern' };

        } catch (error) {
            logError(`[SuccessionGuard] Heartbeat spoofing detection error:`, error);
            return { level: this.riskLevels.MEDIUM, reason: 'detection_error' };
        }
    }

    /**
     * Detect potential account takeover
     */
    async detectAccountTakeover(userId, req) {
        try {
            // Check for suspicious login patterns
            const recentSessions = await db.select()
                .from(userSessions)
                .where(and(
                    eq(userSessions.userId, userId),
                    gte(userSessions.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)) // Last 24 hours
                ))
                .orderBy(desc(userSessions.createdAt))
                .limit(5);

            // Check for failed MFA attempts
            const recentAudit = await db.select()
                .from(auditLogs)
                .where(and(
                    eq(auditLogs.userId, userId),
                    eq(auditLogs.action, 'MFA_FAILED'),
                    gte(auditLogs.createdAt, new Date(Date.now() - 60 * 60 * 1000)) // Last hour
                ))
                .limit(3);

            if (recentAudit.length >= 3) {
                return {
                    level: this.riskLevels.CRITICAL,
                    reason: 'multiple_mfa_failures',
                    details: { failureCount: recentAudit.length }
                };
            }

            // Check session anomalies
            if (recentSessions.length >= 3) {
                const uniqueIPs = [...new Set(recentSessions.map(s => s.ipAddress))];
                const uniqueUserAgents = [...new Set(recentSessions.map(s => s.userAgent))];

                if (uniqueIPs.length >= 3 && uniqueUserAgents.length >= 3) {
                    return {
                        level: this.riskLevels.HIGH,
                        reason: 'suspicious_session_pattern',
                        details: { uniqueIPs: uniqueIPs.length, uniqueAgents: uniqueUserAgents.length }
                    };
                }
            }

            return { level: this.riskLevels.LOW, reason: 'normal_session_pattern' };

        } catch (error) {
            logError(`[SuccessionGuard] Account takeover detection error:`, error);
            return { level: this.riskLevels.MEDIUM, reason: 'detection_error' };
        }
    }

    /**
     * Check cooldown period before succession escalation
     */
    async checkCooldownPeriod(userId) {
        try {
            // Get last succession-related activity
            const lastSuccessionActivity = await db.select()
                .from(auditLogs)
                .where(and(
                    eq(auditLogs.userId, userId),
                    sql`${auditLogs.action} LIKE 'SUCCESSION_%'`
                ))
                .orderBy(desc(auditLogs.createdAt))
                .limit(1);

            if (lastSuccessionActivity.length === 0) {
                return { allowed: true, reason: 'no_previous_activity' };
            }

            const lastActivity = new Date(lastSuccessionActivity[0].createdAt);
            const cooldownExpiry = new Date(lastActivity.getTime() + this.thresholds.cooldownPeriod);
            const now = new Date();

            if (now < cooldownExpiry) {
                const remainingHours = Math.ceil((cooldownExpiry - now) / (60 * 60 * 1000));
                return {
                    allowed: false,
                    reason: 'cooldown_active',
                    remainingHours,
                    cooldownExpiry
                };
            }

            return { allowed: true, reason: 'cooldown_expired' };

        } catch (error) {
            logError(`[SuccessionGuard] Cooldown check error:`, error);
            return { allowed: false, reason: 'check_error' };
        }
    }

    /**
     * Check MFA requirement for critical operations
     */
    async checkMFARequirement(userId, req) {
        try {
            // Get user's MFA status
            const user = await db.query.users.findFirst({
                where: eq(users.id, userId),
                columns: ['mfaEnabled', 'mfaVerifiedAt']
            });

            if (!user?.mfaEnabled) {
                return {
                    verified: false,
                    reason: 'mfa_not_enabled',
                    required: true
                };
            }

            // Check recent MFA verification
            const lastVerified = user.mfaVerifiedAt ? new Date(user.mfaVerifiedAt) : null;
            const graceExpiry = lastVerified ?
                new Date(lastVerified.getTime() + this.thresholds.mfaGracePeriod) :
                new Date(0);

            const now = new Date();

            if (now > graceExpiry) {
                return {
                    verified: false,
                    reason: 'mfa_verification_expired',
                    required: true,
                    lastVerified
                };
            }

            return {
                verified: true,
                reason: 'mfa_recently_verified',
                lastVerified
            };

        } catch (error) {
            logError(`[SuccessionGuard] MFA check error:`, error);
            return {
                verified: false,
                reason: 'check_error',
                required: true
            };
        }
    }

    /**
     * Monitor and handle escalation risks
     */
    async monitorEscalationRisk(userId, endpoint, geoRisk, spoofRisk, takeoverRisk) {
        const risks = [geoRisk, spoofRisk, takeoverRisk];
        const criticalRisks = risks.filter(r => r.level === this.riskLevels.CRITICAL);
        const highRisks = risks.filter(r => r.level === this.riskLevels.HIGH);

        if (criticalRisks.length > 0 || highRisks.length >= 2) {
            // Increment suspicious activity counter
            const currentCount = this.suspiciousActivity.get(userId) || 0;
            this.suspiciousActivity.set(userId, currentCount + 1);

            // Trigger escalation alert if threshold exceeded
            if (currentCount + 1 >= this.thresholds.suspiciousActivityThreshold) {
                await this.triggerEscalationAlert(userId, risks, endpoint);
                this.suspiciousActivity.set(userId, 0); // Reset counter
            }
        } else {
            // Reset counter on normal activity
            this.suspiciousActivity.set(userId, 0);
        }
    }

    /**
     * Trigger escalation alert for suspicious activity
     */
    async triggerEscalationAlert(userId, risks, endpoint) {
        try {
            logWarn(`[SuccessionGuard] Escalation alert triggered for user ${userId}`, { risks, endpoint });

            // Get user details for notification
            const user = await db.query.users.findFirst({
                where: eq(users.id, userId),
                columns: ['email', 'firstName', 'lastName']
            });

            // Send alert notification
            await notificationService.sendNotification(userId, {
                title: 'Security Alert: Suspicious Succession Activity',
                message: `Multiple security risks detected during succession operation: ${risks.map(r => r.reason).join(', ')}. Additional verification required.`,
                type: 'security_alert',
                priority: 'high',
                metadata: {
                    risks,
                    endpoint,
                    timestamp: new Date().toISOString()
                }
            });

            // Audit the escalation
            await auditService.logAuditEvent({
                userId,
                action: 'SUCCESSION_ESCALATION_TRIGGERED',
                resourceType: 'security',
                resourceId: userId,
                metadata: {
                    risks,
                    endpoint,
                    alertType: 'suspicious_activity'
                }
            });

        } catch (error) {
            logError(`[SuccessionGuard] Failed to trigger escalation alert:`, error);
        }
    }

    /**
     * Handle critical risk scenarios
     */
    handleCriticalRisk(res, riskType, riskDetails) {
        const response = new ApiResponse(403, {
            riskType,
            riskLevel: 'CRITICAL',
            details: riskDetails,
            message: 'Critical security risk detected. Succession operation blocked.',
            requiresVerification: true,
            emergencyOverrideAvailable: true
        }, 'SECURITY_RISK_DETECTED');

        return response.send(res);
    }

    /**
     * Handle cooldown period violations
     */
    handleCooldownViolation(res, cooldownCheck) {
        const response = new ApiResponse(429, {
            cooldownActive: true,
            remainingHours: cooldownCheck.remainingHours,
            cooldownExpiry: cooldownCheck.cooldownExpiry,
            message: `Succession operation blocked due to cooldown period. ${cooldownCheck.remainingHours} hours remaining.`,
            emergencyOverrideAvailable: true
        }, 'COOLDOWN_PERIOD_ACTIVE');

        return response.send(res);
    }

    /**
     * Handle MFA requirement
     */
    handleMFARequired(res, mfaCheck) {
        const response = new ApiResponse(401, {
            mfaRequired: true,
            reason: mfaCheck.reason,
            lastVerified: mfaCheck.lastVerified,
            message: 'Multi-factor authentication required for this succession operation.',
            verificationEndpoint: '/api/auth/verify-mfa'
        }, 'MFA_VERIFICATION_REQUIRED');

        return response.send(res);
    }

    /**
     * Audit successful access
     */
    async auditSuccessfulAccess(userId, endpoint, method, req) {
        try {
            await auditService.logAuditEvent({
                userId,
                action: 'SUCCESSION_ACCESS_GRANTED',
                resourceType: 'endpoint',
                resourceId: endpoint,
                metadata: {
                    method,
                    ipAddress: req.ip || req.connection.remoteAddress,
                    userAgent: req.get('User-Agent'),
                    protectionLayer: 'succession_guard'
                }
            });
        } catch (error) {
            logError(`[SuccessionGuard] Failed to audit successful access:`, error);
        }
    }

    /**
     * Audit protection failures
     */
    async auditProtectionFailure(userId, endpoint, error) {
        try {
            await auditService.logAuditEvent({
                userId,
                action: 'SUCCESSION_PROTECTION_FAILURE',
                resourceType: 'security',
                resourceId: endpoint,
                metadata: {
                    error: error.message,
                    protectionLayer: 'succession_guard'
                }
            });
        } catch (auditError) {
            logError(`[SuccessionGuard] Failed to audit protection failure:`, auditError);
        }
    }

    /**
     * Audit emergency override usage
     */
    async auditOverrideUsage(userId, endpoint, overrideType) {
        try {
            await auditService.logAuditEvent({
                userId,
                action: 'EMERGENCY_OVERRIDE_USED',
                resourceType: 'security',
                resourceId: endpoint,
                metadata: {
                    overrideType,
                    protectionLayer: 'succession_guard'
                }
            });
        } catch (error) {
            logError(`[SuccessionGuard] Failed to audit override usage:`, error);
        }
    }

    // Public API methods for manual override management

    /**
     * Activate emergency override (admin/trustee only)
     */
    async activateEmergencyOverride(userId, requesterId, reason, durationHours = 72) {
        try {
            const expiry = new Date(Date.now() + (durationHours * 60 * 60 * 1000));

            this.activeOverrides.set(userId, {
                activatedBy: requesterId,
                reason,
                expiry,
                activatedAt: new Date()
            });

            logInfo(`[SuccessionGuard] Emergency override activated for user ${userId} by ${requesterId}`);

            // Audit the override activation
            await auditService.logAuditEvent({
                userId: requesterId,
                action: 'EMERGENCY_OVERRIDE_ACTIVATED',
                resourceType: 'security',
                resourceId: userId,
                metadata: {
                    reason,
                    durationHours,
                    expiry: expiry.toISOString()
                }
            });

            return { success: true, expiry };

        } catch (error) {
            logError(`[SuccessionGuard] Failed to activate emergency override:`, error);
            throw error;
        }
    }

    /**
     * Deactivate emergency override
     */
    async deactivateEmergencyOverride(userId, requesterId) {
        try {
            const override = this.activeOverrides.get(userId);
            if (!override) {
                throw new Error('No active emergency override found');
            }

            this.activeOverrides.delete(userId);

            logInfo(`[SuccessionGuard] Emergency override deactivated for user ${userId} by ${requesterId}`);

            // Audit the override deactivation
            await auditService.logAuditEvent({
                userId: requesterId,
                action: 'EMERGENCY_OVERRIDE_DEACTIVATED',
                resourceType: 'security',
                resourceId: userId,
                metadata: {
                    previousOverride: override
                }
            });

            return { success: true };

        } catch (error) {
            logError(`[SuccessionGuard] Failed to deactivate emergency override:`, error);
            throw error;
        }
    }

    /**
     * Get current protection status for a user
     */
    async getProtectionStatus(userId) {
        try {
            const emergencyOverride = this.activeOverrides.get(userId);
            const suspiciousActivityCount = this.suspiciousActivity.get(userId) || 0;

            // Get recent security events
            const recentEvents = await db.select()
                .from(auditLogs)
                .where(and(
                    eq(auditLogs.userId, userId),
                    sql`${auditLogs.action} LIKE '%SUCCESSION%' OR ${auditLogs.action} LIKE '%SECURITY%'`,
                    gte(auditLogs.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
                ))
                .orderBy(desc(auditLogs.createdAt))
                .limit(10);

            return {
                userId,
                emergencyOverrideActive: !!emergencyOverride,
                emergencyOverrideExpiry: emergencyOverride?.expiry,
                suspiciousActivityCount,
                suspiciousActivityThreshold: this.thresholds.suspiciousActivityThreshold,
                recentSecurityEvents: recentEvents.length,
                protectionLevel: 'ACTIVE'
            };

        } catch (error) {
            logError(`[SuccessionGuard] Failed to get protection status:`, error);
            throw error;
        }
    }
}

// Export singleton instance
const successionGuard = new SuccessionGuard();
export default successionGuard;

// Export middleware function for easy use
export const successionGuardMiddleware = successionGuard.middleware;