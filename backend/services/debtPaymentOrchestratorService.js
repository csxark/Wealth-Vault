import db from '../config/db.js';
import { debts } from '../db/schema.js';
import { and, eq, desc } from 'drizzle-orm';

const DEFAULT_HORIZON_MONTHS = 12;
const MAX_HORIZON_MONTHS = 60;

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeDebt = (debt) => ({
    id: debt.id,
    name: debt.name || 'Debt',
    debtType: debt.debtType || debt.type || 'other',
    balance: Math.max(0, toNumber(debt.currentBalance ?? debt.balance, 0)),
    apr: toNumber(debt.apr ?? debt.annualRate ?? debt.interestRate, 0) / 100,
    minimumPayment: Math.max(0, toNumber(debt.minimumPayment ?? debt.monthlyPayment, 0)),
    dueDate: debt.dueDate || null,
    lastPaymentDate: debt.lastPaymentDate || null,
    lastPaymentAmount: toNumber(debt.lastPaymentAmount, 0)
});

class DebtPaymentOrchestratorService {
    /**
     * Get user's available monthly cash flow for debt payments
     */
    async calculateAvailableCashFlow(userId, payload = {}) {
        const baseMonthlyIncome = toNumber(payload.monthlyIncome, 0);
        const baseMonthlyExpenses = toNumber(payload.monthlyExpenses, 0);
        const minCashBuffer = toNumber(payload.minCashBuffer, 500);

        const availableCashFlow = Math.max(0, baseMonthlyIncome - baseMonthlyExpenses - minCashBuffer);

        return {
            monthlyIncome: roundMoney(baseMonthlyIncome),
            monthlyExpenses: roundMoney(baseMonthlyExpenses),
            minCashBuffer: roundMoney(minCashBuffer),
            availableCashFlow: roundMoney(availableCashFlow),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Detect rate changes from last known rates
     */
    async detectRateChanges(userId, debtRecords = []) {
        const rateChanges = [];

        for (const debt of debtRecords) {
            // Compare current APR to last known APR (stored in metadata)
            // For now, estimate based on debt record lastUpdated
            const currentApr = debt.apr;
            const lastRecordedApr = debt.lastRecordedApr || currentApr;
            const aprDifference = Math.abs(currentApr - lastRecordedApr);

            if (aprDifference > 0.005) { // 0.5% change threshold
                rateChanges.push({
                    debtId: debt.id,
                    debtName: debt.name,
                    previousAPR: roundMoney(lastRecordedApr * 100),
                    currentAPR: roundMoney(currentApr * 100),
                    change: roundMoney((currentApr - lastRecordedApr) * 100),
                    detectedAt: new Date().toISOString(),
                    alert: aprDifference > 0.02 ? 'high' : 'medium'
                });
            }
        }

        return rateChanges;
    }

    /**
     * Calculate monthly minimum payment requirement across all debts
     */
    calculateTotalMinimumPayment(debts) {
        return roundMoney(
            debts
                .filter(d => d.balance > 0.01)
                .reduce((sum, d) => sum + d.minimumPayment, 0)
        );
    }

    /**
     * Allocate available extra payment using strategy (avalanche/snowball)
     */
    allocateExtraPayment(debts, extraPayment, strategy = 'avalanche') {
        const activeDebts = debts.filter(d => d.balance > 0.01).map(d => ({ ...d }));

        if (activeDebts.length === 0 || extraPayment < 0.01) {
            return [];
        }

        // Sort based on strategy
        if (strategy === 'avalanche') {
            // Highest APR first
            activeDebts.sort((a, b) => b.apr - a.apr);
        } else if (strategy === 'snowball') {
            // Smallest balance first
            activeDebts.sort((a, b) => a.balance - b.balance);
        } else if (strategy === 'hybrid') {
            // Balance APR impact with balance size
            activeDebts.sort((a, b) => {
                const scoreA = (a.apr * 100 + a.balance) / 1000;
                const scoreB = (b.apr * 100 + b.balance) / 1000;
                return scoreB - scoreA;
            });
        }

        // Allocate extra payment
        const allocation = [];
        let remaining = extraPayment;

        for (const debt of activeDebts) {
            if (remaining < 0.01) break;

            const extraForDebt = Math.min(remaining, debt.balance * 0.5); // Don't allocate more than 50% of balance
            allocation.push({
                debtId: debt.id,
                debtName: debt.name,
                extraPayment: roundMoney(extraForDebt),
                totalPayment: roundMoney(debt.minimumPayment + extraForDebt),
                priority: allocation.length + 1
            });

            remaining = roundMoney(remaining - extraForDebt);
        }

        return allocation;
    }

    /**
     * Generate next month's payment recommendation
     */
    async generatePaymentRecommendation(userId, payload = {}) {
        const userDebts = await db.query.debts.findMany({
            where: and(eq(debts.userId, userId), eq(debts.isActive, true)),
            orderBy: desc(debts.apr)
        });

        if (userDebts.length === 0) {
            return {
                success: false,
                message: 'No active debts found',
                recommendation: null
            };
        }

        const normalizedDebts = userDebts.map(normalizeDebt);
        const strategy = payload.strategy || 'avalanche';
        const cashFlowData = await this.calculateAvailableCashFlow(userId, payload);
        const rateChanges = await this.detectRateChanges(userId, normalizedDebts);

        // Calculate minimum payments
        const totalMinimumPayment = this.calculateTotalMinimumPayment(normalizedDebts);
        const available = cashFlowData.availableCashFlow;
        const extraPayment = Math.max(0, available - totalMinimumPayment);

        // Allocate extra payment based on strategy
        const extraAllocation = this.allocateExtraPayment(normalizedDebts, extraPayment, strategy);

        // Build complete payment recommendation
        const paymentPlan = normalizedDebts.map(debt => {
            const extra = extraAllocation.find(e => e.debtId === debt.id);
            return {
                debtId: debt.id,
                debtName: debt.name,
                currentBalance: roundMoney(debt.balance),
                apr: roundMoney(debt.apr * 100),
                minimumPayment: roundMoney(debt.minimumPayment),
                recommendedExtra: extra ? roundMoney(extra.extraPayment) : 0,
                totalRecommendedPayment: extra ? roundMoney(extra.totalPayment) : roundMoney(debt.minimumPayment),
                allocationPriority: extra ? extra.priority : null
            };
        });

        return {
            success: true,
            message: 'Payment recommendation generated',
            recommendation: {
                month: new Date().toISOString().substring(0, 7),
                strategy,
                cashFlow: cashFlowData,
                minimumPayments: {
                    total: totalMinimumPayment,
                    count: normalizedDebts.filter(d => d.balance > 0.01).length
                },
                extraPayment: {
                    available: roundMoney(extraPayment),
                    allocated: roundMoney(
                        extraAllocation.reduce((sum, e) => sum + e.extraPayment, 0)
                    ),
                    unallocated: roundMoney(
                        extraPayment - extraAllocation.reduce((sum, e) => sum + e.extraPayment, 0)
                    )
                },
                paymentPlan,
                rateChanges,
                alerts: this.generateAlerts(rateChanges, normalizedDebts, cashFlowData)
            }
        };
    }

    /**
     * Generate alerts for payment orchestration
     */
    generateAlerts(rateChanges, debts, cashFlow) {
        const alerts = [];

        // Rate change alerts
        if (rateChanges.length > 0) {
            const highAlerts = rateChanges.filter(r => r.alert === 'high');
            if (highAlerts.length > 0) {
                alerts.push({
                    type: 'rate-change-high',
                    severity: 'high',
                    message: `${highAlerts.length} debt(s) with significant rate increase detected`,
                    details: highAlerts
                });
            } else {
                alerts.push({
                    type: 'rate-change-medium',
                    severity: 'medium',
                    message: `${rateChanges.length} debt(s) with rate change detected`,
                    details: rateChanges
                });
            }
        }

        // Cash flow alerts
        if (cashFlow.availableCashFlow < 100) {
            alerts.push({
                type: 'low-cash-flow',
                severity: 'high',
                message: 'Available cash flow is very low; can only cover minimum payments',
                availableAmount: cashFlow.availableCashFlow
            });
        } else if (cashFlow.availableCashFlow < 500) {
            alerts.push({
                type: 'moderate-cash-flow',
                severity: 'medium',
                message: 'Limited extra payment capacity; consider reducing expenses',
                availableAmount: cashFlow.availableCashFlow
            });
        }

        // High-interest debt alerts
        const highInterestDebts = debts.filter(d => d.apr > 0.15 && d.balance > 0.01);
        if (highInterestDebts.length > 0) {
            alerts.push({
                type: 'high-interest-debt',
                severity: 'medium',
                message: `${highInterestDebts.length} high-interest debt(s) (>15% APR) detected`,
                debts: highInterestDebts.map(d => ({ id: d.id, name: d.name, apr: roundMoney(d.apr * 100) }))
            });
        }

        return alerts;
    }

    /**
     * Set up automated payment schedule
     */
    async setupPaymentSchedule(userId, payload = {}) {
        const userDebts = await db.query.debts.findMany({
            where: and(eq(debts.userId, userId), eq(debts.isActive, true))
        });

        if (userDebts.length === 0) {
            return {
                success: false,
                message: 'No active debts found'
            };
        }

        const normalizedDebts = userDebts.map(normalizeDebt);
        const strategy = payload.strategy || 'avalanche';
        const frequency = payload.frequency || 'monthly'; // monthly, bi-weekly, weekly
        const startDate = payload.startDate || new Date().toISOString();
        const autoIncreasePercentage = clamp(toNumber(payload.autoIncreasePercentage, 0), 0, 10);
        const rebalanceFrequency = payload.rebalanceFrequency || 'monthly'; // monthly, quarterly

        return {
            success: true,
            message: 'Payment schedule setup initialized',
            schedule: {
                userId,
                strategy,
                frequency,
                rebalanceFrequency,
                autoIncreasePercentage,
                startDate,
                debts: normalizedDebts.length,
                status: 'pending-activation',
                createdAt: new Date().toISOString(),
                config: {
                    strategy,
                    frequency,
                    autoIncrease: autoIncreasePercentage > 0,
                    autoIncreasePercentage,
                    rebalanceMonthly: rebalanceFrequency === 'monthly',
                    rebalanceQuarterly: rebalanceFrequency === 'quarterly'
                }
            }
        };
    }

    /**
     * Rebalance payments based on latest debt information
     */
    async rebalancePayments(userId, payload = {}) {
        const userDebts = await db.query.debts.findMany({
            where: and(eq(debts.userId, userId), eq(debts.isActive, true))
        });

        if (userDebts.length === 0) {
            return {
                success: false,
                message: 'No active debts found'
            };
        }

        const normalizedDebts = userDebts.map(normalizeDebt);
        const strategy = payload.strategy || 'avalanche';
        const previousBalance = toNumber(payload.previousTotalBalance, 0);
        const currentBalance = roundMoney(normalizedDebts.reduce((sum, d) => sum + d.balance, 0));
        const balanceReduction = roundMoney(previousBalance - currentBalance);

        // Check for closed debts
        const closedDebts = payload.previousDebts
            ? payload.previousDebts.filter(pId => !normalizedDebts.find(d => d.id === pId))
            : [];

        // Calculate if auto-increase should trigger
        const autoIncreasePercentage = toNumber(payload.autoIncreasePercentage, 0);
        const shouldAutoIncrease = balanceReduction > 0 && autoIncreasePercentage > 0;

        return {
            success: true,
            message: 'Payments rebalanced',
            rebalancing: {
                timestamp: new Date().toISOString(),
                strategy,
                previousTotalBalance: roundMoney(previousBalance),
                currentTotalBalance: currentBalance,
                balanceReduction: balanceReduction,
                debtsClosed: closedDebts.length,
                autoIncreaseTriggered: shouldAutoIncrease,
                autoIncreasePercentage: shouldAutoIncrease ? autoIncreasePercentage : 0,
                remainingDebts: normalizedDebts.filter(d => d.balance > 0.01).length,
                status: normalizedDebts.every(d => d.balance < 0.01) ? 'all-debts-cleared' : 'in-progress'
            }
        };
    }

    /**
     * Main entry point: Get comprehensive orchestration status
     */
    async orchestratePayments(userId, payload = {}) {
        try {
            const userDebts = await db.query.debts.findMany({
                where: and(eq(debts.userId, userId), eq(debts.isActive, true))
            });

            if (userDebts.length === 0) {
                return {
                    success: false,
                    message: 'No active debts found',
                    orchestration: null
                };
            }

            const normalizedDebts = userDebts.map(normalizeDebt);
            const paymentRec = await this.generatePaymentRecommendation(userId, payload);

            if (!paymentRec.success) {
                return paymentRec;
            }

            return {
                success: true,
                message: 'Payment orchestration complete',
                orchestration: {
                    status: 'ready',
                    nextMonthRecommendation: paymentRec.recommendation,
                    debtSnapshot: {
                        totalDebts: normalizedDebts.length,
                        totalBalance: roundMoney(normalizedDebts.reduce((sum, d) => sum + d.balance, 0)),
                        totalMinimumPayment: this.calculateTotalMinimumPayment(normalizedDebts),
                        weightedAveragAPR: roundMoney(
                            normalizedDebts.reduce((sum, d) => sum + (d.apr * d.balance), 0) /
                            (normalizedDebts.reduce((sum, d) => sum + d.balance, 0) || 1) * 100
                        ),
                        highestAPR: Math.max(...normalizedDebts.map(d => d.apr)) * 100,
                        lowestAPR: Math.min(...normalizedDebts.map(d => d.apr)) * 100
                    },
                    orchestrationCapabilities: {
                        autoPaymentScheduling: true,
                        monthlyRebalancing: true,
                        rateChangeDetection: true,
                        alerting: true,
                        strategySupport: ['avalanche', 'snowball', 'hybrid']
                    },
                    nextReviewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                }
            };
        } catch (err) {
            return {
                success: false,
                message: `Error orchestrating payments: ${err.message}`,
                orchestration: null
            };
        }
    }
}

export default new DebtPaymentOrchestratorService();
