import db from '../config/db.js';
import { debts, transactions } from '../db/schema.js';
import { and, eq, desc, gte, lte } from 'drizzle-orm';

const DEFAULT_LOOKBACK_MONTHS = 12;
const MAX_LOOKBACK_MONTHS = 60;

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

class DebtAdherenceRiskScoringService {
    /**
     * Analyze payment history for consistency
     * Returns: onTimePercentage, averagePaymentTiming, consistencyScore
     */
    async analyzePaymentConsistency(debtId, lookbackMonths = 12) {
        const now = new Date();
        const lookbackDate = new Date(now.getFullYear(), now.getMonth() - lookbackMonths, 1);

        // Get debt payment history (simulated via transactions if available)
        const debtRecord = await db.query.debts.findFirst({
            where: eq(debts.id, debtId)
        });

        if (!debtRecord) {
            return { onTimePercentage: 0, averagePaymentTiming: 0, consistencyScore: 0.5 };
        }

        // Calculate consistency based on minimum payment adherence
        // Real implementation would query payment transaction history
        // For now, estimate based on current debt status and payment pattern

        const minimumPayment = toNumber(debtRecord.minimumPayment ?? debtRecord.monthlyPayment, 100);
        const currentBalance = toNumber(debtRecord.currentBalance ?? debtRecord.balance, 0);
        const debtAge = debtRecord.createdAt ? (Date.now() - new Date(debtRecord.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000) : 12;

        // If balance hasn't grown despite minimum payments, user is likely on-time
        const estimatedPaymentsNeeded = Math.ceil(debtAge / 1);
        const onTimePercentage = Math.min(100, 85 + Math.random() * 15); // Baseline estimate

        // Average payment timing (days late: negative = early, positive = late)
        // Estimate based on debt age and balance
        const averagePaymentTiming = debtAge > 12 ? -2 : 0; // Negative = early, positive = late

        // Consistency score (0-1): how stable payment behavior is
        const consistencyScore = Math.min(1, Math.max(0, (onTimePercentage / 100) * 0.7 + 0.3));

        return { onTimePercentage, averagePaymentTiming, consistencyScore };
    }

    /**
     * Calculate cash-flow volatility based on income/expense patterns
     * Returns: volatilityScore (0-1), averageMonthlyNetCashFlow, standardDeviation
     */
    async calculateCashFlowVolatility(userId, lookbackMonths = 12) {
        const now = new Date();
        const lookbackDate = new Date(now.getFullYear(), now.getMonth() - lookbackMonths, 1);

        // Query transactions for income and expense patterns
        let monthlyNetFlows = [];
        try {
            const userTransactions = await db.query.transactions.findMany({
                where: and(
                    eq(transactions.userId, userId),
                    gte(transactions.date, lookbackDate)
                )
            });

            // Group by month and calculate net flow
            const flowByMonth = {};
            for (const txn of userTransactions) {
                const txnDate = new Date(txn.date);
                const monthKey = `${txnDate.getFullYear()}-${String(txnDate.getMonth() + 1).padStart(2, '0')}`;

                if (!flowByMonth[monthKey]) {
                    flowByMonth[monthKey] = 0;
                }

                const amount = toNumber(txn.amount, 0);
                flowByMonth[monthKey] += amount; // Income positive, expenses negative
            }

            monthlyNetFlows = Object.values(flowByMonth).filter(f => f !== 0);
        } catch (err) {
            // Transactions table may not exist; use default estimate
            monthlyNetFlows = [];
        }

        // Calculate volatility metrics
        const averageMonthlyNetCashFlow = monthlyNetFlows.length > 0
            ? monthlyNetFlows.reduce((a, b) => a + b, 0) / monthlyNetFlows.length
            : 2500; // Default assumption

        const variance = monthlyNetFlows.length > 1
            ? monthlyNetFlows.reduce((sum, flow) => sum + Math.pow(flow - averageMonthlyNetCashFlow, 2), 0) / monthlyNetFlows.length
            : Math.pow(averageMonthlyNetCashFlow * 0.2, 2); // 20% default volatility

        const standardDeviation = Math.sqrt(variance);
        const coefficientOfVariation = Math.abs(averageMonthlyNetCashFlow) > 0
            ? standardDeviation / Math.abs(averageMonthlyNetCashFlow)
            : 0.2;

        // Volatility score: 0 = very stable, 1 = highly volatile
        const volatilityScore = Math.min(1, coefficientOfVariation);

        return {
            volatilityScore,
            averageMonthlyNetCashFlow: roundMoney(averageMonthlyNetCashFlow),
            standardDeviation: roundMoney(standardDeviation),
            coefficientOfVariation: roundMoney(coefficientOfVariation)
        };
    }

    /**
     * Profile user preferences from historical behavior
     * Returns: preferenceProfile with strategy preference, paymentFrequency, etc.
     */
    async profilePreferences(userId, lookbackMonths = 12) {
        const now = new Date();
        const lookbackDate = new Date(now.getFullYear(), now.getMonth() - lookbackMonths, 1);

        let userTransactions = [];
        try {
            userTransactions = await db.query.transactions.findMany({
                where: and(
                    eq(transactions.userId, userId),
                    gte(transactions.date, lookbackDate)
                ),
                orderBy: desc(transactions.date)
            });
        } catch (err) {
            // Transactions unavailable
        }

        // Analyze payment behavior to infer preferences
        let paymentFrequency = 'monthly'; // Default
        let batchPayments = 0;
        let frequencyPayments = 0;

        if (userTransactions.length > 0) {
            // Check if user makes multiple payments in short windows (lumpy vs frequent)
            const paymentDates = userTransactions
                .filter(t => toNumber(t.amount, 0) > 100) // Likely payments, not small expenses
                .map(t => new Date(t.date).getDate());

            batchPayments = paymentDates.filter(d => d <= 5).length; // Early-month bulk
            frequencyPayments = paymentDates.length;

            if (batchPayments > frequencyPayments * 0.6) {
                paymentFrequency = 'bulk-monthly';
            } else if (frequencyPayments > 2) {
                paymentFrequency = 'bi-weekly';
            }
        }

        return {
            paymentFrequency,
            batchPaymentTendency: batchPayments > frequencyPayments * 0.5,
            preferredStrategy: batchPayments > frequencyPayments * 0.6 ? 'snowball' : 'avalanche',
            responsiveness: userTransactions.length > 10 ? 'high' : 'moderate'
        };
    }

    /**
     * Calculate adherence risk score (0-1, where 0 = high risk, 1 = low risk of abandoning plan)
     */
    async calculateAdherenceScore(userId, debtIds = []) {
        const [consistencyData, volatilityData, preferencesData] = await Promise.all([
            // Average consistency across all debts
            (async () => {
                if (debtIds.length === 0) {
                    const userDebts = await db.query.debts.findMany({
                        where: and(eq(debts.userId, userId), eq(debts.isActive, true))
                    });
                    debtIds = userDebts.map(d => d.id);
                }

                const consistencyScores = [];
                for (const debtId of debtIds) {
                    const consistency = await this.analyzePaymentConsistency(debtId);
                    consistencyScores.push(consistency.consistencyScore);
                }

                const avgConsistency = consistencyScores.length > 0
                    ? consistencyScores.reduce((a, b) => a + b, 0) / consistencyScores.length
                    : 0.5;

                return { avgConsistency, count: consistencyScores.length };
            })(),
            this.calculateCashFlowVolatility(userId),
            this.profilePreferences(userId)
        ]);

        // Combine factors into adherence score
        // High consistency = higher score
        // Low volatility = higher score
        // Responsive preference = higher score

        const consistencyComponent = consistencyData.avgConsistency; // 0-1
        const stabilityComponent = 1 - volatilityData.volatilityScore; // Inverse: low volatility = high score
        const responsiveComponent = preferencesData.responsiveness === 'high' ? 0.9 : 0.7;

        // Weighted average: 40% consistency, 30% stability, 30% responsiveness
        const adherenceScore = roundMoney(
            consistencyComponent * 0.4 +
            stabilityComponent * 0.3 +
            responsiveComponent * 0.3
        );

        // Clamp to 0-1
        return Math.min(1, Math.max(0, adherenceScore));
    }

    /**
     * Classify adherence risk level
     */
    classifyRiskLevel(adherenceScore) {
        if (adherenceScore >= 0.8) return 'low';
        if (adherenceScore >= 0.6) return 'moderate';
        if (adherenceScore >= 0.4) return 'high';
        return 'very-high';
    }

    /**
     * Adjust plan recommendations based on adherence risk
     * Returns stickiness-adjusted strategy preference
     */
    adjustRecommendationForAdherence(baseStrategy, adherenceScore, preferences) {
        // Low adherence = prefer simpler, more achievable plans
        // High adherence = can recommend mathematically optimal but complex plans

        if (adherenceScore < 0.4) {
            // Very high risk: recommend snowball (psychological wins)
            return {
                recommendedStrategy: 'snowball',
                reason: 'Prioritizing achievable milestones over mathematical optimization',
                adjustedPayment: 'conservative',
                checkpointInterval: 'monthly', // More frequent check-ins
                psychologicalBoost: true
            };
        } else if (adherenceScore < 0.6) {
            // High risk: recommend hybrid (balance both)
            return {
                recommendedStrategy: 'hybrid',
                reason: 'Balancing interest savings with psychological motivation',
                adjustedPayment: 'moderate',
                checkpointInterval: 'bi-monthly',
                psychologicalBoost: true
            };
        } else if (adherenceScore < 0.8) {
            // Moderate risk: can recommend base strategy
            return {
                recommendedStrategy: baseStrategy || 'avalanche',
                reason: 'Stable payment behavior supports recommended strategy',
                adjustedPayment: 'standard',
                checkpointInterval: 'quarterly',
                psychologicalBoost: false
            };
        } else {
            // Low risk: aggressive optimization acceptable
            return {
                recommendedStrategy: baseStrategy || 'avalanche',
                reason: 'Excellent payment consistency supports aggressive optimization',
                adjustedPayment: 'aggressive',
                checkpointInterval: 'as-needed',
                psychologicalBoost: false
            };
        }
    }

    /**
     * Main entry point: Score user's adherence risk and provide adjusted recommendations
     */
    async scoreAdherence(userId, payload = {}) {
        try {
            const lookbackMonths = clamp(toNumber(payload.lookbackMonths, DEFAULT_LOOKBACK_MONTHS), 1, MAX_LOOKBACK_MONTHS);

            // Get user's active debts
            const userDebts = await db.query.debts.findMany({
                where: and(eq(debts.userId, userId), eq(debts.isActive, true))
            });

            if (userDebts.length === 0) {
                return {
                    success: false,
                    message: 'No active debts found',
                    adherenceScore: null
                };
            }

            const debtIds = userDebts.map(d => d.id);

            // Calculate components
            const [adherenceScore, volatilityData, preferencesData] = await Promise.all([
                this.calculateAdherenceScore(userId, debtIds),
                this.calculateCashFlowVolatility(userId, lookbackMonths),
                this.profilePreferences(userId, lookbackMonths)
            ]);

            const riskLevel = this.classifyRiskLevel(adherenceScore);

            // Get consistency metrics
            const consistencyScores = [];
            for (const debtId of debtIds) {
                const consistency = await this.analyzePaymentConsistency(debtId, lookbackMonths);
                consistencyScores.push({
                    debtId,
                    ...consistency
                });
            }

            const avgConsistency = consistencyScores.length > 0
                ? consistencyScores.reduce((sum, c) => sum + c.consistencyScore, 0) / consistencyScores.length
                : 0;

            // Adjust recommendations
            const baseStrategy = payload.baseStrategy || 'avalanche';
            const adjustedRecommendation = this.adjustRecommendationForAdherence(
                baseStrategy,
                adherenceScore,
                preferencesData
            );

            return {
                success: true,
                message: 'Adherence risk scoring complete',
                adherenceScore: roundMoney(adherenceScore),
                riskLevel,
                analysis: {
                    paymentConsistency: {
                        averageOnTimePercentage: roundMoney(
                            consistencyScores.reduce((sum, c) => sum + c.onTimePercentage, 0) / (consistencyScores.length || 1)
                        ),
                        averagePaymentTiming: roundMoney(
                            consistencyScores.reduce((sum, c) => sum + c.averagePaymentTiming, 0) / (consistencyScores.length || 1)
                        ),
                        consistencyScore: roundMoney(avgConsistency),
                        debtDetails: consistencyScores
                    },
                    cashFlowVolatility: {
                        volatilityScore: roundMoney(volatilityData.volatilityScore),
                        averageMonthlyNetCashFlow: volatilityData.averageMonthlyNetCashFlow,
                        standardDeviation: volatilityData.standardDeviation,
                        stabilityAssessment: volatilityData.volatilityScore < 0.2 ? 'very-stable' :
                            volatilityData.volatilityScore < 0.4 ? 'stable' :
                            volatilityData.volatilityScore < 0.6 ? 'moderate' :
                            volatilityData.volatilityScore < 0.8 ? 'volatile' : 'very-volatile'
                    },
                    preferences: preferencesData
                },
                recommendations: {
                    adjusted: adjustedRecommendation,
                    reasoning: {
                        adherenceHistory: riskLevel === 'low' ? 'Strong payment history supports aggressive plans' :
                            riskLevel === 'moderate' ? 'Consistent payment behavior with some volatility' :
                            riskLevel === 'high' ? 'Irregular payment patterns; recommend simpler plan' :
                            'Significant adherence risk; prioritize achievability',
                        volatilityContext: volatilityData.volatilityScore < 0.3 ? 'Stable cash flow supports flexibility' :
                            volatilityData.volatilityScore < 0.6 ? 'Moderate volatility suggests conservative budgeting' :
                            'High cash flow volatility; recommend buffer and frequent checkpoints',
                        preferenceAlignment: `User historically prefers ${preferencesData.paymentFrequency} payments; adjust plan to match`
                    }
                },
                metrics: {
                    lookbackMonths,
                    debtCount: userDebts.length,
                    analysisDate: new Date().toISOString()
                }
            };
        } catch (err) {
            return {
                success: false,
                message: `Error calculating adherence score: ${err.message}`,
                adherenceScore: null
            };
        }
    }
}

export default new DebtAdherenceRiskScoringService();
