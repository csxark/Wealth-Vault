/**
 * Payoff Strategy Service
 * Manages debt payoff strategies: snowball, avalanche, and custom strategies
 */

import db from '../config/db.js';
import {
    debts,
    payoffStrategies,
    payoffSimulations,
    payoffSimulationItems,
    debtMilestones
} from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import debtAmortizationService from './debtAmortizationService.js';
import { logInfo, logError } from '../utils/logger.js';

class PayoffStrategyService {
    /**
     * Generate Avalanche Strategy (highest APR first)
     * Targets highest interest rate debts first to minimize total interest
     */
    async generateAvalancheStrategy(tenantId, userId, extraMonthlyPayment = 0) {
        try {
            const userDebts = await db.query.debts.findMany({
                where: and(eq(debts.userId, userId), eq(debts.isActive, true), eq(debts.tenantId, tenantId)),
                orderBy: (debts, { desc }) => [desc(debts.annualRate)]
            });

            if (userDebts.length === 0) return null;

            return {
                strategyType: 'avalanche',
                debts: userDebts.map(d => ({
                    id: d.id,
                    name: d.name,
                    balance: parseFloat(d.currentBalance),
                    apr: parseFloat(d.annualRate),
                    monthlyPayment: parseFloat(d.monthlyPayment)
                })),
                priorityOrder: userDebts.map(d => d.id),
                description: 'Focus on highest interest rate debts first to minimize total interest paid',
                extraMonthlyPayment
            };
        } catch (error) {
            logError(`Failed to generate avalanche strategy: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate Snowball Strategy (smallest balance first)
     * Targets lowest balance debts first for psychological wins
     */
    async generateSnowballStrategy(tenantId, userId, extraMonthlyPayment = 0) {
        try {
            const userDebts = await db.query.debts.findMany({
                where: and(eq(debts.userId, userId), eq(debts.isActive, true), eq(debts.tenantId, tenantId)),
                orderBy: (debts, { asc }) => [asc(debts.currentBalance)]
            });

            if (userDebts.length === 0) return null;

            return {
                strategyType: 'snowball',
                debts: userDebts.map(d => ({
                    id: d.id,
                    name: d.name,
                    balance: parseFloat(d.currentBalance),
                    apr: parseFloat(d.annualRate),
                    monthlyPayment: parseFloat(d.monthlyPayment)
                })),
                priorityOrder: userDebts.map(d => d.id),
                description: 'Focus on smallest balance debts first for quick wins and motivation',
                extraMonthlyPayment
            };
        } catch (error) {
            logError(`Failed to generate snowball strategy: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate Hybrid Strategy (balanced approach)
     * Combines snowball psychology with avalanche math
     */
    async generateHybridStrategy(tenantId, userId, extraMonthlyPayment = 0) {
        try {
            const userDebts = await db.query.debts.findMany({
                where: and(eq(debts.userId, userId), eq(debts.isActive, true), eq(debts.tenantId, tenantId))
            });

            if (userDebts.length === 0) return null;

            // Score each debt: 40% balance (smallest first), 60% APR (highest first)
            const scored = userDebts.map(d => ({
                ...d,
                balanceNormalized: parseFloat(d.currentBalance) / Math.max(...userDebts.map(x => parseFloat(x.currentBalance))),
                aprNormalized: parseFloat(d.annualRate) / Math.max(...userDebts.map(x => parseFloat(x.annualRate))),
                score: 0
            }));

            scored.forEach(d => {
                d.score = (0.4 * (1 - d.balanceNormalized)) + (0.6 * d.aprNormalized);
            });

            scored.sort((a, b) => b.score - a.score);

            return {
                strategyType: 'hybrid',
                debts: scored.map(d => ({
                    id: d.id,
                    name: d.name,
                    balance: parseFloat(d.currentBalance),
                    apr: parseFloat(d.annualRate),
                    monthlyPayment: parseFloat(d.monthlyPayment),
                    score: d.score.toFixed(2)
                })),
                priorityOrder: scored.map(d => d.id),
                description: 'Balanced approach: 60% focus on high interest + 40% focus on small balances',
                extraMonthlyPayment
            };
        } catch (error) {
            logError(`Failed to generate hybrid strategy: ${error.message}`);
            throw error;
        }
    }

    /**
     * Simulate a payoff strategy over time
     */
    async simulateStrategy(tenantId, userId, strategyId, monthsToSimulate = 360) {
        try {
            const strategy = await db.query.payoffStrategies.findFirst({
                where: and(eq(payoffStrategies.id, strategyId), eq(payoffStrategies.userId, userId))
            });

            if (!strategy) throw new Error('Strategy not found');

            const userDebts = await db.query.debts.findMany({
                where: and(eq(debts.userId, userId), eq(debts.isActive, true), eq(debts.tenantId, tenantId))
            });

            if (userDebts.length === 0) return null;

            const extraPayment = parseFloat(strategy.extraMonthlyPayment) || 0;
            const priorityOrder = strategy.priorityOrder || userDebts.map(d => d.id);

            // Initialize debt states
            let remainingDebts = userDebts.map(d => ({
                id: d.id,
                name: d.name,
                balance: parseFloat(d.currentBalance),
                apr: parseFloat(d.annualRate),
                minimumPayment: parseFloat(d.monthlyPayment)
            }));

            const simulation = [];
            let totalMonths = 0;
            let totalInterestPaid = 0;
            let totalPrincipalPaid = 0;
            const paidOffDates = {};

            while (remainingDebts.some(d => d.balance > 0) && totalMonths < monthsToSimulate) {
                totalMonths++;
                let monthlyInterest = 0;
                let monthlyPrincipal = 0;
                let extraRemaining = extraPayment;
                const monthDate = new Date();
                monthDate.setMonth(monthDate.getMonth() + totalMonths);

                // 1. Calculate minimum payments and apply to all debts
                for (let debt of remainingDebts) {
                    if (debt.balance <= 0) continue;

                    const interest = Math.round(debt.balance * (debt.apr / 100 / 12) * 100) / 100;
                    monthlyInterest += interest;

                    let payment = Math.min(debt.balance + interest, debt.minimumPayment);
                    let principal = payment - interest;

                    debt.balance = Math.round((debt.balance - principal) * 100) / 100;
                    monthlyPrincipal += principal;
                    totalInterestPaid += interest;
                    totalPrincipalPaid += principal;
                }

                // 2. Apply extra payment to prioritized debt
                for (let debtId of priorityOrder) {
                    const debt = remainingDebts.find(d => d.id === debtId);
                    if (!debt || debt.balance <= 0 || extraRemaining <= 0) continue;

                    const applyExtra = Math.min(debt.balance, extraRemaining);
                    debt.balance = Math.round((debt.balance - applyExtra) * 100) / 100;
                    monthlyPrincipal += applyExtra;
                    totalPrincipalPaid += applyExtra;
                    extraRemaining -= applyExtra;

                    // Mark debt as paid off
                    if (debt.balance <= 0 && !paidOffDates[debt.id]) {
                        paidOffDates[debt.id] = monthDate;
                    }
                }

                const totalBalance = Math.round(remainingDebts.reduce((sum, d) => sum + d.balance, 0) * 100) / 100;

                simulation.push({
                    month: totalMonths,
                    monthDate,
                    minimumPayments: monthlyInterest + monthlyPrincipal - extraPayment,
                    extraPayments: Math.min(extraPayment, monthlyPrincipal),
                    totalPayment: monthlyInterest + monthlyPrincipal,
                    principalPaid: monthlyPrincipal,
                    interestPaid: monthlyInterest,
                    totalBalance,
                    debtsPaid: Object.keys(paidOffDates).length
                });

                // Remove paid-off debts from tracking
                remainingDebts = remainingDebts.filter(d => d.balance > 0);
            }

            const freedomDate = simulation.length > 0 ? simulation[simulation.length - 1].monthDate : null;

            // Store simulation in database
            const [storedSimulation] = await db
                .insert(payoffSimulations)
                .values({
                    tenantId,
                    userId,
                    strategyId,
                    simulationName: `${strategy.strategyType} simulation`,
                    strategyType: strategy.strategyType,
                    extraMonthlyPayment: extraPayment,
                    totalMonthsToPayoff: totalMonths,
                    freedomDate,
                    totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
                    totalPaid: Math.round((totalInterestPaid + totalPrincipalPaid) * 100) / 100,
                    interestSavedVsMinimum: 0, // Would calculate if comparing to minimum payments
                    simulatedAt: new Date()
                })
                .returning();

            // Store simulation items
            const items = simulation.map(item => ({
                tenantId,
                simulationId: storedSimulation.id,
                monthNumber: item.month,
                simulationMonthDate: item.monthDate,
                totalMinimumPayments: Math.round(item.minimumPayments * 100) / 100,
                totalExtraPayments: Math.round(item.extraPayments * 100) / 100,
                totalInterest: Math.round(item.interestPaid * 100) / 100,
                totalPrincipal: Math.round(item.principalPaid * 100) / 100,
                totalPayment: Math.round(item.totalPayment * 100) / 100,
                totalRemainingBalance: item.totalBalance,
                debtsRemainingInteger: remainingDebts.length,
                cumulativeInterest: Math.round(simulation.slice(0, item.month).reduce((sum, i) => sum + i.interestPaid, 0) * 100) / 100,
                cumulativePaid: Math.round(simulation.slice(0, item.month).reduce((sum, i) => sum + i.totalPayment, 0) * 100) / 100
            }));

            await db.insert(payoffSimulationItems).values(items);

            return {
                simulation: storedSimulation,
                items: simulation,
                summary: {
                    monthsToPayoff: totalMonths,
                    freedomDate,
                    totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
                    totalPaid: Math.round((totalInterestPaid + totalPrincipalPaid) * 100) / 100,
                    paidOffDates
                }
            };
        } catch (error) {
            logError(`Failed to simulate strategy: ${error.message}`);
            throw error;
        }
    }

    /**
     * Compare multiple strategies
     */
    async compareStrategies(tenantId, userId, monthsToSimulate = 360) {
        try {
            const strategies = await db.query.payoffStrategies.findMany({
                where: and(eq(payoffStrategies.userId, userId), eq(payoffStrategies.isActive, true))
            });

            const comparisons = [];

            for (const strategy of strategies) {
                const simulation = await this.simulateStrategy(tenantId, userId, strategy.id, monthsToSimulate);
                if (simulation) {
                    comparisons.push({
                        strategy: {
                            id: strategy.id,
                            type: strategy.strategyType,
                            name: strategy.name,
                            extraMonthlyPayment: parseFloat(strategy.extraMonthlyPayment)
                        },
                        results: simulation.summary
                    });
                }
            }

            // Sort by freedom date (fastest payoff)
            comparisons.sort((a, b) => new Date(a.results.freedomDate) - new Date(b.results.freedomDate));

            return comparisons;
        } catch (error) {
            logError(`Failed to compare strategies: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create and save a strategy
     */
    async createStrategy(tenantId, userId, strategyData) {
        try {
            const [strategy] = await db
                .insert(payoffStrategies)
                .values({
                    tenantId,
                    userId,
                    strategyType: strategyData.strategyType,
                    name: strategyData.name,
                    description: strategyData.description,
                    extraMonthlyPayment: strategyData.extraMonthlyPayment || 0,
                    priorityOrder: strategyData.priorityOrder || [],
                    isActive: true,
                    autoApply: strategyData.autoApply || false,
                    activatedAt: new Date()
                })
                .returning();

            // Run simulation to get projections
            const simulation = await this.simulateStrategy(tenantId, userId, strategy.id);

            if (simulation) {
                // Update strategy with projections
                await db
                    .update(payoffStrategies)
                    .set({
                        projectedPayoffMonths: simulation.summary.monthsToPayoff,
                        projectedFreedomDate: simulation.summary.freedomDate,
                        projectedInterestSaved: simulation.summary.interestSavedVsMinimum
                    })
                    .where(eq(payoffStrategies.id, strategy.id));
            }

            return strategy;
        } catch (error) {
            logError(`Failed to create strategy: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get strategy recommendations based on debt profile
     */
    async getRecommendations(tenantId, userId) {
        try {
            const userDebts = await db.query.debts.findMany({
                where: and(eq(debts.userId, userId), eq(debts.isActive, true))
            });

            if (userDebts.length === 0) return null;

            const totalBalance = userDebts.reduce((sum, d) => sum + parseFloat(d.currentBalance), 0);
            const avgApr = userDebts.reduce((sum, d) => sum + parseFloat(d.annualRate), 0) / userDebts.length;
            const highInterestCount = userDebts.filter(d => parseFloat(d.annualRate) > 10).length;

            let recommendation = 'snowball'; // Default
            let reason = 'Start with quick wins to build momentum';

            if (highInterestCount > 0 && avgApr > 8) {
                recommendation = 'avalanche';
                reason = 'High interest rates detected. Focus on APR to minimize total interest';
            }

            if (userDebts.length > 3 && avgApr <= 6) {
                recommendation = 'hybrid';
                reason = 'Balanced approach works best with multiple low-rate debts';
            }

            return {
                recommendedStrategy: recommendation,
                reason,
                debtProfile: {
                    totalDebts: userDebts.length,
                    totalBalance,
                    averageApr: avgApr.toFixed(2),
                    highInterestDebts: highInterestCount
                }
            };
        } catch (error) {
            logError(`Failed to get recommendations: ${error.message}`);
            throw error;
        }
    }
}

export default new PayoffStrategyService();
