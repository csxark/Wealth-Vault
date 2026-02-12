import { db } from '../db/index.js';
import { expenses, auditLogs, anomalyPatterns } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

class AuditEngine {
    /**
     * Scans user transactions for anomalies based on active patterns
     */
    async performForensicScan(userId) {
        logInfo(`Starting forensic scan for user: ${userId}`);
        const findings = [];

        try {
            const activePatterns = await db.select()
                .from(anomalyPatterns)
                .where(and(
                    eq(anomalyPatterns.userId, userId),
                    eq(anomalyPatterns.isActive, true)
                ));

            if (activePatterns.length === 0) {
                // Initialize default patterns if none exist
                await this.initializeDefaultPatterns(userId);
            }

            for (const pattern of activePatterns) {
                const anomalies = await this.detectAnomalies(userId, pattern);
                if (anomalies.length > 0) {
                    findings.push(...anomalies);
                    await this.logAuditFindings(userId, pattern, anomalies);
                }
            }

            return findings;
        } catch (error) {
            logError(`Forensic scan failed for user ${userId}:`, error);
            throw error;
        }
    }

    async detectAnomalies(userId, pattern) {
        switch (pattern.detectionLogic) {
            case 'outlier':
                return await this.detectOutliers(userId, pattern.threshold);
            case 'velocity':
                return await this.detectVelocitySpikes(userId, pattern.threshold);
            case 'location_jump':
                return await this.detectLocationJumps(userId);
            case 'duplicate_payout':
                return await this.detectDuplicatePayouts(userId);
            default:
                return [];
        }
    }

    async detectOutliers(userId, zThreshold) {
        // Simple Z-score based outlier detection for amounts
        const stats = await db.select({
            avg: sql`AVG(${expenses.amount})`,
            stddev: sql`STDDEV(${expenses.amount})`
        }).from(expenses).where(eq(expenses.userId, userId));

        const { avg, stddev } = stats[0];
        if (!avg || !stddev || stddev === 0) return [];

        const outliers = await db.select()
            .from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                sql`ABS(${expenses.amount} - ${avg}) / ${stddev} > ${zThreshold}`
            ));

        return outliers.map(tx => ({
            type: 'outlier',
            transactionId: tx.id,
            amount: tx.amount,
            message: `Transaction amount ${tx.amount} is an outlier (Z-score > ${zThreshold})`
        }));
    }

    async detectVelocitySpikes(userId, countThreshold) {
        // Detect more than X transactions in 1 hour
        const oneHourAgo = new Date(Date.now() - 3600000);

        const spikes = await db.select({
            count: sql`COUNT(*)`,
            userId: expenses.userId
        })
            .from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                gte(expenses.date, oneHourAgo)
            ))
            .groupBy(expenses.userId)
            .having(sql`COUNT(*) > ${countThreshold}`);

        if (spikes.length > 0) {
            return [{
                type: 'velocity_spike',
                message: `User performed ${spikes[0].count} transactions in the last hour, exceeding threshold of ${countThreshold}`
            }];
        }
        return [];
    }

    async detectDuplicatePayouts(userId) {
        // Detect exact same amount/merchant within 5 minutes
        const duplicates = await db.execute(sql`
            SELECT e1.id, e1.amount, e1.description, e1.date
            FROM expenses e1
            JOIN expenses e2 ON e1.user_id = e2.user_id 
                AND e1.amount = e2.amount 
                AND e1.description = e2.description 
                AND e1.id != e2.id
                AND ABS(EXTRACT(EPOCH FROM (e1.date - e2.date))) < 300
            WHERE e1.user_id = ${userId}
        `);

        return duplicates.map(d => ({
            type: 'duplicate',
            transactionId: d.id,
            message: `Potential duplicate transaction detected: ${d.amount} at ${d.description}`
        }));
    }

    async detectLocationJumps(userId) {
        // Placeholder for Geo-spatial jump detection
        // In a real app, we'd compare IP location or merchant state
        return [];
    }

    async logAuditFindings(userId, pattern, anomalies) {
        for (const anomaly of anomalies) {
            await db.insert(auditLogs).values({
                userId,
                actionType: 'anomaly_detected',
                severity: 'warning',
                details: anomaly,
                metadata: { patternId: pattern.id }
            });
        }

        await db.update(anomalyPatterns)
            .set({
                lastDetectionAt: new Date(),
                detectionCount: sql`${anomalyPatterns.detectionCount} + ${anomalies.length}`,
                updatedAt: new Date()
            })
            .where(eq(anomalyPatterns.id, pattern.id));
    }

    async initializeDefaultPatterns(userId) {
        const defaults = [
            { userId, patternName: 'Amount Outlier', detectionLogic: 'outlier', threshold: 3.0 },
            { userId, patternName: 'High Velocity', detectionLogic: 'velocity', threshold: 5.0 },
            { userId, patternName: 'Duplicate Payment', detectionLogic: 'duplicate_payout', threshold: 0 }
        ];

        for (const d of defaults) {
            await db.insert(anomalyPatterns).values(d);
        }
    }
}

export default new AuditEngine();
