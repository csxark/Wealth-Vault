import db from '../config/db.js';
import {
    behavioralProfiles,
    expenses,
    users,
    securityEvents,
    fraudPreventionShields,
    fraudIntercepts
} from '../db/schema.js';
import { eq, and, sql, desc, gte } from 'drizzle-orm';
import { analyzeTransactionRisk } from './securityAI.js';

/**
 * Behavioral Forensic Engine (L3)
 * Creates normalcy baselines and detects deviations for fraud prevention
 */
class BehaviorForensicService {
    /**
     * Build or update a user's behavioral profile
     * @param {string} userId - User ID
     */
    async updateBehavioralProfile(userId) {
        try {
            // Get last 6 months of expenses
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

            const userExpenses = await db.select()
                .from(expenses)
                .where(and(
                    eq(expenses.userId, userId),
                    gte(expenses.date, sixMonthsAgo)
                ));

            if (userExpenses.length < 5) return null; // Not enough data for baseline

            // 1. Calculate Average Transaction Value
            const totalAmount = userExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
            const avgValue = totalAmount / userExpenses.length;

            // 2. Spending Velocity (Transactions per day)
            const daysCount = 180; // approx 6 months
            const velocity = userExpenses.length / daysCount;

            // 3. Peak Spending Hours
            const hourCounts = new Array(24).fill(0);
            userExpenses.forEach(e => {
                const hour = new Date(e.date).getHours();
                hourCounts[hour]++;
            });
            const peakHours = hourCounts
                .map((count, hour) => ({ hour, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5)
                .map(h => h.hour);

            // 4. Category Distributions
            const categoryMap = {};
            userExpenses.forEach(e => {
                const catId = e.categoryId || 'uncategorized';
                categoryMap[catId] = (categoryMap[catId] || 0) + 1;
            });

            // 5. Common Geolocations & Device Fingerprints (from security events)
            // Note: Since securityEvents might be missing, we handle it gracefully
            let commonLocations = [];
            let commonFingerprints = [];

            try {
                const events = await db.select()
                    .from(securityEvents)
                    .where(eq(securityEvents.userId, userId))
                    .orderBy(desc(securityEvents.createdAt))
                    .limit(100);

                const locMap = {};
                const fpMap = {};

                events.forEach(ev => {
                    if (ev.location) {
                        const locKey = JSON.stringify(ev.location);
                        locMap[locKey] = (locMap[locKey] || 0) + 1;
                    }
                    if (ev.deviceInfo?.fingerprint) {
                        const fp = ev.deviceInfo.fingerprint;
                        fpMap[fp] = (fpMap[fp] || 0) + 1;
                    }
                });

                commonLocations = Object.entries(locMap)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([loc]) => JSON.parse(loc));

                commonFingerprints = Object.entries(fpMap)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([fp]) => fp);
            } catch (e) {
                console.warn('Could not fetch security events for behavioral profiling');
            }

            const normalcyBaseline = {
                avgTransactionValue: avgValue,
                spendingVelocity: velocity,
                commonGeolocations: commonLocations,
                commonDeviceFingerprints: commonFingerprints,
                peakSpendingHours: peakHours,
                categoryDistributions: categoryMap
            };

            // Update or Insert profile
            const [existing] = await db.select().from(behavioralProfiles).where(eq(behavioralProfiles.userId, userId));

            if (existing) {
                await db.update(behavioralProfiles)
                    .set({
                        normalcyBaseline,
                        lastAnalysisAt: new Date(),
                        updatedAt: new Date()
                    })
                    .where(eq(behavioralProfiles.userId, userId));
            } else {
                await db.insert(behavioralProfiles).values({
                    userId,
                    normalcyBaseline,
                    lastAnalysisAt: new Date()
                });
            }

            return normalcyBaseline;
        } catch (error) {
            console.error('Behavioral profiling failed:', error);
            throw error;
        }
    }

    /**
     * Calculate fraud risk score for a new transaction
     * @param {string} userId - User ID
     * @param {Object} transactionData - Transaction details
     * @returns {Promise<Object>} Risk assessment
     */
    async assessTransactionSecurity(userId, transactionData) {
        try {
            const [profile] = await db.select().from(behavioralProfiles).where(eq(behavioralProfiles.userId, userId));
            const baseline = profile?.normalcyBaseline;

            let riskScore = 0;
            const reasons = [];

            // 1. AI Content Analysis (Gemini)
            const aiRisk = await analyzeTransactionRisk(transactionData);
            riskScore += (aiRisk.riskScore * 0.4); // Weight 40%
            if (aiRisk.isSuspicious) reasons.push(...aiRisk.scamIndicators);

            if (baseline) {
                // 2. Value Variance
                const amount = parseFloat(transactionData.amount);
                if (amount > baseline.avgTransactionValue * 5) {
                    riskScore += 30;
                    reasons.push('Transaction value significantly higher than baseline');
                }

                // 3. Time Deviance
                const hour = new Date().getHours();
                if (!baseline.peakSpendingHours.includes(hour)) {
                    riskScore += 10;
                    reasons.push('Unusual spending hour');
                }

                // 4. Location/Device Deviance (if provided)
                if (transactionData.location && baseline.commonGeolocations.length > 0) {
                    const isNewLoc = !baseline.commonGeolocations.some(loc =>
                        loc.country === transactionData.location.country &&
                        loc.city === transactionData.location.city
                    );
                    if (isNewLoc) {
                        riskScore += 25;
                        reasons.push('New or unusual geolocation detected');
                    }
                }
            } else {
                // No profile yet, be conservative
                riskScore += 10;
                reasons.push('Lack of behavioral history');
            }

            // Cap risk score at 100
            riskScore = Math.min(Math.round(riskScore), 100);

            return {
                riskScore,
                reasons,
                isHighRisk: riskScore >= 70,
                shouldHold: riskScore >= 50
            };
        } catch (error) {
            console.error('Transaction assessment failed:', error);
            return { riskScore: 50, reasons: ['System error during assessment'], isHighRisk: false, shouldHold: true };
        }
    }

    /**
     * Intercept and hold transaction if necessary
     */
    async shieldTransaction(userId, transactionData) {
        let [shield] = await db.select().from(fraudPreventionShields).where(eq(fraudPreventionShields.userId, userId));

        if (!shield) {
            // Auto-initialize shield for the user
            [shield] = await db.insert(fraudPreventionShields).values({
                userId,
                isEnabled: true,
                strictnessLevel: 'moderate',
                blockingThreshold: 80,
                reviewThreshold: 50
            }).returning();
        }

        if (!shield?.isEnabled) return { status: 'passed' };

        const assessment = await this.assessTransactionSecurity(userId, transactionData);

        if (assessment.riskScore >= shield.blockingThreshold) {
            return { status: 'blocked', assessment };
        }

        if (assessment.riskScore >= shield.reviewThreshold) {
            const [intercept] = await db.insert(fraudIntercepts).values({
                userId,
                transactionData,
                riskScore: assessment.riskScore,
                riskReasons: assessment.reasons,
                status: 'held'
            }).returning();

            return { status: 'held', interceptId: intercept.id, assessment };
        }

        return { status: 'passed' };
    }
}

export default new BehaviorForensicService();
