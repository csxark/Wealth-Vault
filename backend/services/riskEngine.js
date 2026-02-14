import db from '../config/db.js';
import { userRiskProfiles, anomalyLogs, securityCircuitBreakers, expenses } from '../db/schema.js';
import { eq, and, sql, desc, gte } from 'drizzle-orm';
import notificationService from './notificationService.js';

/**
 * Risk Engine (L3)
 * Statistical Anomaly Detection using Z-Score and Velocity Analysis.
 */
class RiskEngine {
    /**
     * Inspect a transaction for anomalies
     * @param {string} userId 
     * @param {Object} transactionData - { amount, type, metadata }
     */
    async inspectTransaction(userId, transactionData) {
        const { amount, resourceType, resourceId } = transactionData;
        const val = parseFloat(amount);

        // 1. Get User Risk Profile
        let profile = await db.query.userRiskProfiles.findFirst({
            where: eq(userRiskProfiles.userId, userId)
        });

        if (!profile) {
            profile = await this.initializeRiskProfile(userId);
        }

        const avg = parseFloat(profile.avgTransactionAmount || 0);
        const stdDev = parseFloat(profile.stdDevTransactionAmount || 0);

        let riskScore = 0;
        let reasons = [];

        // 2. Z-Score Analysis (Amount Anomaly)
        if (stdDev > 0) {
            const zScore = Math.abs(val - avg) / stdDev;
            if (zScore > 3) {
                riskScore += 40;
                reasons.push(`Z-SCORE_VIOLATION: Amount $${val} is ${zScore.toFixed(2)} std devs from mean`);
            } else if (zScore > 2) {
                riskScore += 20;
            }
        }

        // 3. Velocity Analysis (Daily Spending)
        const dailyTotal = await this.getDailySpending(userId);
        if (dailyTotal + val > parseFloat(profile.dailyVelocityLimit)) {
            riskScore += 50;
            reasons.push(`VELOCITY_VIOLATION: Daily spend exceeding limit of $${profile.dailyVelocityLimit}`);
        }

        // 4. Geolocation / IP Check (Simulated)
        if (transactionData.metadata?.ipAddress && profile.metadata?.lastKnownIp) {
            if (transactionData.metadata.ipAddress !== profile.metadata.lastKnownIp) {
                riskScore += 30;
                reasons.push('GEOLOCATION_MISMATCH: Unusual IP address');
            }
        }

        // 5. Take Action
        if (riskScore >= 70) {
            await this.logAnomaly(userId, resourceType, resourceId, riskScore, reasons.join('; '), 'critical');
            await this.tripCircuitBreaker(userId, `High risk detected: ${reasons[0]}`);
            return { action: 'block', riskScore, reasons };
        } else if (riskScore >= 40) {
            await this.logAnomaly(userId, resourceType, resourceId, riskScore, reasons.join('; '), 'high');
            return { action: 'flag', riskScore, reasons };
        }

        return { action: 'allow', riskScore, reasons };
    }

    async getDailySpending(userId) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const result = await db.select({
            total: sql`sum(${expenses.amount})`
        }).from(expenses)
            .where(and(eq(expenses.userId, userId), gte(expenses.date, startOfDay)));

        return parseFloat(result[0]?.total || 0);
    }

    async initializeRiskProfile(userId) {
        const [profile] = await db.insert(userRiskProfiles).values({
            userId,
            avgTransactionAmount: '0',
            stdDevTransactionAmount: '0',
            dailyVelocityLimit: '10000',
            riskScore: 0
        }).returning();
        return profile;
    }

    async logAnomaly(userId, resourceType, resourceId, riskScore, reason, severity) {
        await db.insert(anomalyLogs).values({
            userId,
            resourceType,
            resourceId,
            riskScore,
            reason,
            severity
        });
    }

    async tripCircuitBreaker(userId, reason) {
        await db.insert(securityCircuitBreakers).values({
            userId,
            status: 'tripped',
            trippedAt: new Date(),
            reason
        });

        // Critical Notification (L3)
        await notificationService.sendNotification(userId, {
            title: 'CRITICAL: Account Protection Tripped',
            message: `Your account has been restricted due to suspicious activity: ${reason}. Please verify your identity.`,
            type: 'security_critical'
        });
    }

    async isCircuitBreakerTripped(userId) {
        const breaker = await db.query.securityCircuitBreakers.findFirst({
            where: eq(securityCircuitBreakers.userId, userId),
            orderBy: desc(securityCircuitBreakers.createdAt)
        });
        return breaker?.status === 'tripped';
    }
}

export default new RiskEngine();
