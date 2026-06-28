import db from '../config/db.js';
import { debts, paymentHistory } from '../db/schema.js';
import { and, eq, desc, lte, gte } from 'drizzle-orm';

const DEFAULT_RISK_HORIZON = 90; // days
const DEFAULT_MIN_CASH_BUFFER = 500;
const PAYMENT_GRACE_PERIOD_DAYS = 5; // threshold for "late"

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeDebt = (debt) => ({
    id: debt.id,
    name: debt.name || 'Debt',
    balance: Math.max(0, toNumber(debt.currentBalance ?? debt.balance, 0)),
    apr: toNumber(debt.apr ?? debt.annualRate ?? debt.interestRate, 0) / 100,
    minimumPayment: Math.max(0, toNumber(debt.minimumPayment ?? debt.monthlyPayment, 0)),
    dueDate: debt.dueDate || null,
    issueDate: debt.issueDate || null
});

// Risk classification thresholds: 0-25 (low), 26-50 (moderate), 51-75 (elevated), 76-100 (critical)
const RISK_TIERS = {
    low: { min: 0, max: 25, color: 'green', severity: 'low', interventionIntensity: 'monitor' },
    moderate: { min: 26, max: 50, color: 'yellow', severity: 'moderate', interventionIntensity: 'engage' },
    elevated: { min: 51, max: 75, color: 'orange', severity: 'elevated', interventionIntensity: 'intervene' },
    critical: { min: 76, max: 100, color: 'red', severity: 'critical', interventionIntensity: 'urgent' }
};

// Intervention playbooks by severity
const INTERVENTION_PLAYBOOKS = {
    low: [
        { action: 'maintain-schedule', impact: 0, description: 'Continue current payment schedule' },
        { action: 'optimize-buffer', impact: 2, description: 'Build additional cash buffer for stability' }
    ],
    moderate: [
        { action: 'enable-reminders', impact: 8, description: 'Enable payment reminders (3, 7, 14 days pre-due)' },
        { action: 'reduce-minimum-5pct', impact: 5, description: 'Reduce minimum payment target by 5% to ease cash flow' },
        { action: 'extend-horizon-3mo', impact: 12, description: 'Extend payoff horizon by 3 months' }
    ],
    elevated: [
        { action: 'enable-reminders', impact: 10, description: 'Enable aggressive payment reminders (daily post-due)' },
        { action: 'reduce-minimum-10pct', impact: 8, description: 'Reduce minimum payment target by 10%' },
        { action: 'consider-consolidation', impact: 15, description: 'Explore debt consolidation to lower minimums' },
        { action: 'temporary-pause', impact: 20, description: 'Request 30-60 day temporary payment pause (if available)' },
        { action: 'auto-enable-microPayments', impact: 12, description: 'Enable micro-payment nudges for extra capacity' }
    ],
    critical: [
        { action: 'immediate-contact', impact: 25, description: 'Contact creditor/servicer immediately to discuss hardship options' },
        { action: 'reduce-minimum-15pct', impact: 12, description: 'Request minimum payment reduction of 15%+' },
        { action: 'hardship-program', impact: 30, description: 'Enroll in creditor hardship program (may impact credit temporarily)' },
        { action: 'debt-restructure', impact: 35, description: 'Explore debt restructuring or settlement negotiation' },
        { action: 'emergency-fund-deploy', impact: 15, description: 'Deploy emergency fund strategically to avoid delinquency' },
        { action: 'credit-counseling', impact: 28, description: 'Engage non-profit credit counseling service' }
    ]
};

class DelinquencyEarlyWarningService {
    /**
     * Fetch payment history for a user's debts
     */
    async getPaymentHistory(userId, debtIds = []) {
        try {
            const query = [userId, '=', eq(db.query.paymentHistory.userId, userId)];
            
            // Fetch all payment history for the user
            const history = await db.query.paymentHistory.findMany({
                where: eq(db.query.paymentHistory.userId, userId),
                orderBy: (ph, { desc }) => [desc(ph.paymentDate)]
            });

            return history || [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Calculate days late from payment history for a specific debt
     * High days-late frequency = strong delinquency signal
     */
    calculateDaysLateDistribution(history = [], dueDate = null) {
        if (!history || history.length === 0) return { avgDaysLate: 0, maxDaysLate: 0, latePaymentFreq: 0, streakLength: 0 };

        const daysLateArray = history
            .filter(h => h.paymentDate && h.dueDate)
            .map(h => {
                const actualDate = new Date(h.paymentDate);
                const expectedDate = new Date(h.dueDate);
                const diffMs = actualDate - expectedDate;
                const diffDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                return diffDays;
            });

        if (daysLateArray.length === 0) return { avgDaysLate: 0, maxDaysLate: 0, latePaymentFreq: 0, streakLength: 0 };

        const avgDaysLate = roundMoney(daysLateArray.reduce((a, b) => a + b, 0) / daysLateArray.length);
        const maxDaysLate = Math.max(...daysLateArray);
        const latePaymentFreq = roundMoney((daysLateArray.filter(d => d > PAYMENT_GRACE_PERIOD_DAYS).length / daysLateArray.length) * 100);

        // Calculate consecutive late payments (streak)
        let streakLength = 0;
        for (let i = 0; i < daysLateArray.length; i++) {
            if (daysLateArray[i] > PAYMENT_GRACE_PERIOD_DAYS) {
                streakLength++;
            } else {
                break;
            }
        }

        return { avgDaysLate, maxDaysLate, latePaymentFreq, streakLength };
    }

    /**
     * Analyze utilization ratio trend
     * Rising utilization = less buffer capacity = higher risk
     */
    calculateUtilizationTrend(debt, history = []) {
        const currentUtilization = debt.balance > 0 && debt.creditLimit
            ? roundMoney((debt.balance / debt.creditLimit) * 100)
            : roundMoney((debt.balance / (debt.balance + debt.minimumPayment * 24)) * 100); // estimate credit limit

        const historicalUtilizations = history
            .filter(h => h.balanceAfterPayment !== null && h.balanceAfterPayment !== undefined)
            .slice(0, 6) // last 6 months
            .map(h => {
                const limit = h.creditLimit || (h.balanceAfterPayment + h.minimumPayment * 24);
                return roundMoney((h.balanceAfterPayment / limit) * 100);
            });

        if (historicalUtilizations.length === 0) {
            return { currentUtilization, trend: 'stable', utilizationSpike: 0 };
        }

        const avgHistoricalUtilization = roundMoney(historicalUtilizations.reduce((a, b) => a + b, 0) / historicalUtilizations.length);
        const utilizationSpike = roundMoney(currentUtilization - avgHistoricalUtilization);
        const trend = utilizationSpike > 10 ? 'rising' : utilizationSpike < -10 ? 'falling' : 'stable';

        return { currentUtilization, trend, utilizationSpike };
    }

    /**
     * Detect buffer erosion: declining cash balance between payments
     */
    calculateBufferErosion(history = []) {
        const recentPayments = history.slice(0, 6); // last 6 payments
        if (recentPayments.length < 2) return { bufferTrend: 'insufficient-data', erosionRate: 0, currentBuffer: 0 };

        const buffers = recentPayments
            .filter(h => h.cashBalanceBeforePayment !== null && h.cashBalanceBeforePayment !== undefined)
            .map(h => toNumber(h.cashBalanceBeforePayment, 0));

        if (buffers.length < 2) return { bufferTrend: 'insufficient-data', erosionRate: 0, currentBuffer: buffers[0] || 0 };

        const newestBuffer = buffers[0];
        const oldestBuffer = buffers[buffers.length - 1];
        const erosionSize = oldestBuffer - newestBuffer;
        const erosionRate = oldestBuffer > 0 ? roundMoney((erosionSize / oldestBuffer) * 100) : 0;

        const bufferTrend = erosionRate > 15 ? 'eroding' : erosionRate < -15 ? 'recovering' : 'stable';

        return { bufferTrend, erosionRate, currentBuffer: newestBuffer };
    }

    /**
     * Calculate minimum payment affordability
     * If payment eats > 45% of monthly disposable income, risk rises
     */
    calculateMinimumAffordability(debt, monthlyDisposableIncome = 0) {
        const monthlyRate = debt.apr / 12;
        const interestCharge = roundMoney(debt.balance * monthlyRate);
        const effectiveMinimum = Math.max(debt.minimumPayment, interestCharge);

        if (monthlyDisposableIncome === 0) {
            return { affordabilityRatio: 100, affordabilityStatus: 'critical', recommendation: 'no-income-reported' };
        }

        const affordabilityRatio = roundMoney((effectiveMinimum / monthlyDisposableIncome) * 100);
        const affordabilityStatus = affordabilityRatio > 45 ? 'unaffordable' : affordabilityRatio > 30 ? 'stretched' : 'sustainable';

        return { affordabilityRatio, affordabilityStatus, effectiveMinimum };
    }

    /**
     * Feature engineering: combine all signals into a composite risk score
     */
    scoreDelinquencyRisk(debtData, paymentHistoryData, monthlyDisposableIncome = 0) {
        const signals = {};

        // Signal 1: Days-late history (0-30 points)
        const daysLate = this.calculateDaysLateDistribution(paymentHistoryData, debtData.dueDate);
        signals.daysLateScore = clamp((daysLate.avgDaysLate / 60) * 20 + (daysLate.latePaymentFreq / 100) * 10, 0, 30);

        // Signal 2: Utilization trend (0-25 points)
        const utilization = this.calculateUtilizationTrend(debtData, paymentHistoryData);
        const utilizationScore = clamp((utilization.currentUtilization / 100) * 20 + (utilization.utilizationSpike / 50) * 5, 0, 25);
        signals.utilizationScore = utilizationScore;

        // Signal 3: Buffer erosion (0-20 points)
        const erosion = this.calculateBufferErosion(paymentHistoryData);
        signals.bufferErosionScore = clamp((Math.abs(erosion.erosionRate) / 100) * 20, 0, 20);

        // Signal 4: Minimum affordability (0-25 points)
        const affordability = this.calculateMinimumAffordability(debtData, monthlyDisposableIncome);
        signals.affordabilityScore = clamp((affordability.affordabilityRatio / 100) * 25, 0, 25);

        // Composite score (weighted average)
        const compositeScore = roundMoney(
            (signals.daysLateScore * 0.35 + signals.utilizationScore * 0.25 + signals.bufferErosionScore * 0.20 + signals.affordabilityScore * 0.20)
        );

        return {
            compositeScore: clamp(compositeScore, 0, 100),
            signals,
            keyDrivers: this.identifyKeyDrivers(signals, daysLate, utilization, erosion, affordability)
        };
    }

    /**
     * Identify which factors are most impacting the risk score
     */
    identifyKeyDrivers(signals, daysLate, utilization, erosion, affordability) {
        const drivers = [];

        if (signals.daysLateScore > 15) {
            drivers.push({
                factor: 'Payment History',
                severity: signals.daysLateScore > 25 ? 'critical' : 'high',
                detail: `Average ${daysLate.avgDaysLate} days late; ${daysLate.latePaymentFreq}% of payments delayed`,
                weight: signals.daysLateScore
            });
        }

        if (signals.affordabilityScore > 15) {
            drivers.push({
                factor: 'Minimum Payment Affordability',
                severity: signals.affordabilityScore > 20 ? 'critical' : 'high',
                detail: `Minimum payment is ${affordability.affordabilityRatio}% of disposable income (threshold: 45%)`,
                weight: signals.affordabilityScore
            });
        }

        if (signals.utilizationScore > 15) {
            drivers.push({
                factor: 'Utilization Trend',
                severity: utilization.trend === 'rising' ? 'elevated' : 'moderate',
                detail: `Current utilization ${utilization.currentUtilization}%; trend is ${utilization.trend}`,
                weight: signals.utilizationScore
            });
        }

        if (signals.bufferErosionScore > 10) {
            drivers.push({
                factor: 'Buffer Erosion',
                severity: signals.bufferErosionScore > 15 ? 'elevated' : 'moderate',
                detail: `Cash buffer declining at ${erosion.erosionRate}% per cycle`,
                weight: signals.bufferErosionScore
            });
        }

        return drivers.sort((a, b) => b.weight - a.weight);
    }

    /**
     * Classify risk tier by score
     */
    classifyRiskTier(score) {
        const tiers = Object.entries(RISK_TIERS);
        for (const [tierName, tierDef] of tiers) {
            if (score >= tierDef.min && score <= tierDef.max) {
                return tierName;
            }
        }
        return 'critical';
    }

    /**
     * Generate intervention recommendations based on risk tier
     */
    recommendInterventions(riskTier, debt, keyDrivers = []) {
        const basePlaybook = INTERVENTION_PLAYBOOKS[riskTier] || INTERVENTION_PLAYBOOKS.critical;
        const interventions = basePlaybook.map(intervention => ({
            ...intervention,
            estimatedImpactOnDefaultProbability: `${intervention.impact}% reduction in 90-day delinquency likelihood`
        }));

        // Prioritize interventions based on key drivers
        if (keyDrivers.length > 0) {
            const topDriver = keyDrivers[0];
            if (topDriver.factor === 'Minimum Payment Affordability') {
                interventions.sort((a, b) => {
                    if (a.action.includes('minimum')) return -1;
                    if (b.action.includes('minimum')) return 1;
                    return 0;
                });
            } else if (topDriver.factor === 'Payment History') {
                interventions.sort((a, b) => {
                    if (a.action.includes('reminder')) return -1;
                    if (b.action.includes('reminder')) return 1;
                    return 0;
                });
            }
        }

        return interventions;
    }

    /**
     * Main method: Full delinquency risk assessment
     */
    async assessDelinquencyRisk(userId, debts = [], monthlyDisposableIncome = 0, options = {}) {
        const horizonDays = toNumber(options.horizonDays, DEFAULT_RISK_HORIZON);
        const minCashBuffer = toNumber(options.minCashBuffer, DEFAULT_MIN_CASH_BUFFER);

        try {
            if (!userId || debts.length === 0) {
                return {
                    success: false,
                    message: 'User ID and debts array required',
                    assessment: null
                };
            }

            // Fetch payment history for all debts
            const paymentHistoryData = await this.getPaymentHistory(userId);

            // Assess each debt
            const debtAssessments = debts.map(debt => {
                const normalized = normalizeDebt(debt);
                const debtHistory = paymentHistoryData.filter(ph => ph.debtId === debt.id) || [];

                const riskScore = this.scoreDelinquencyRisk(normalized, debtHistory, monthlyDisposableIncome);
                const riskTier = this.classifyRiskTier(riskScore.compositeScore);
                const interventions = this.recommendInterventions(riskTier, normalized, riskScore.keyDrivers);

                return {
                    debtId: normalized.id,
                    debtName: normalized.name,
                    balance: normalized.balance,
                    minimumPayment: normalized.minimumPayment,
                    riskScore: riskScore.compositeScore,
                    riskTier,
                    riskTierDef: RISK_TIERS[riskTier],
                    keyDrivers: riskScore.keyDrivers,
                    interventions,
                    signals: riskScore.signals,
                    paymentMetrics: this.calculateDaysLateDistribution(debtHistory, normalized.dueDate),
                    utilizationMetrics: this.calculateUtilizationTrend(normalized, debtHistory),
                    bufferMetrics: this.calculateBufferErosion(debtHistory),
                    affordabilityMetrics: this.calculateMinimumAffordability(normalized, monthlyDisposableIncome)
                };
            });

            // Portfolio-level aggregation
            const criticalDebtCount = debtAssessments.filter(d => d.riskTier === 'critical').length;
            const elevatedCount = debtAssessments.filter(d => d.riskTier === 'elevated').length;
            const portfolioRiskScore = roundMoney(
                debtAssessments.reduce((sum, d) => sum + d.riskScore, 0) / Math.max(1, debtAssessments.length)
            );
            const portfolioRiskTier = this.classifyRiskTier(portfolioRiskScore);

            // Portfolio-level intervention priorities
            const portfolioInterventions = [];
            if (criticalDebtCount > 0) {
                portfolioInterventions.push({
                    level: 'portfolio',
                    priority: 'immediate',
                    action: `Address ${criticalDebtCount} debt(s) at critical risk level`,
                    recommendation: 'Prioritize hardship programs or creditor contact for critical-tier debts'
                });
            }
            if (elevatedCount + criticalDebtCount > 2) {
                portfolioInterventions.push({
                    level: 'portfolio',
                    priority: 'urgent',
                    action: 'Multi-debt consolidation or restructuring needed',
                    recommendation: 'Consider debt consolidation or balance transfer to reduce total payment burden'
                });
            }
            if (monthlyDisposableIncome < 500) {
                portfolioInterventions.push({
                    level: 'portfolio',
                    priority: 'urgent',
                    action: 'Severe cash flow constraint detected',
                    recommendation: 'Engage credit counseling and explore all hardship program options immediately'
                });
            }

            return {
                success: true,
                assessment: {
                    userId,
                    assessmentDate: new Date().toISOString(),
                    horizonDays,
                    portfolioRiskScore,
                    portfolioRiskTier,
                    portfolioRiskTierDef: RISK_TIERS[portfolioRiskTier],
                    summaryMetrics: {
                        totalDebts: debtAssessments.length,
                        criticalDebtCount,
                        elevatedDebtCount: elevatedCount,
                        moderateDebtCount: debtAssessments.filter(d => d.riskTier === 'moderate').length,
                        lowRiskDebtCount: debtAssessments.filter(d => d.riskTier === 'low').length
                    },
                    debtAssessments,
                    portfolioInterventions
                },
                message: 'Delinquency risk assessment complete'
            };
        } catch (error) {
            return {
                success: false,
                message: `Assessment failed: ${error.message}`,
                assessment: null
            };
        }
    }
}

export default new DelinquencyEarlyWarningService();
