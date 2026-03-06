/**
 * Debt Payoff Timeline Service
 * Generates detailed payoff timelines, milestones, and freedom dates
 */

import db from '../config/db.js';
import {
    debts,
    debtPayments,
    debtMilestones,
    amortizationSchedules,
    amortizationItems
} from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import debtAmortizationService from './debtAmortizationService.js';
import { logInfo, logError } from '../utils/logger.js';

class DebtPayoffTimelineService {
    /**
     * Generate comprehensive payoff timeline for all debts
     */
    async generateTimelineForAllDebts(tenantId, userId) {
        try {
            const userDebts = await db.query.debts.findMany({
                where: and(eq(debts.userId, userId), eq(debts.isActive, true), eq(debts.tenantId, tenantId))
            });

            if (userDebts.length === 0) {
                return {
                    debts: [],
                    timeline: [],
                    summary: null
                };
            }

            const timeline = [];
            let allPayoffs = [];

            // Generate timeline for each debt
            for (const debt of userDebts) {
                const schedule = debtAmortizationService.generateAmortizationSchedule(
                    parseFloat(debt.currentBalance),
                    parseFloat(debt.annualRate),
                    parseFloat(debt.monthlyPayment)
                );

                const payoffDate = schedule.payoffDate || new Date();
                allPayoffs.push({
                    debtId: debt.id,
                    debtName: debt.name,
                    debtType: debt.debtType,
                    payoffDate,
                    monthsToPayoff: schedule.months,
                    totalInterestRemaining: schedule.totalInterest
                });

                timeline.push({
                    month: schedule.months,
                    date: payoffDate,
                    event: `${debt.name} paid off`,
                    debtId: debt.id,
                    eventType: 'debt_payoff'
                });
            }

            // Sort by payoff date
            allPayoffs.sort((a, b) => new Date(a.payoffDate) - new Date(b.payoffDate));
            timeline.sort((a, b) => new Date(a.date) - new Date(b.date));

            // Calculate freedom date (last debt paid off)
            const freedomDate = allPayoffs.length > 0 ? allPayoffs[allPayoffs.length - 1].payoffDate : null;

            // Calculate summary metrics
            const totalBalance = userDebts.reduce((sum, d) => sum + parseFloat(d.currentBalance), 0);
            const totalMonthlyPayment = userDebts.reduce((sum, d) => sum + parseFloat(d.monthlyPayment), 0);
            const totalInterestRemaining = allPayoffs.reduce((sum, d) => sum + d.totalInterestRemaining, 0);

            return {
                debts: userDebts.map(d => ({
                    id: d.id,
                    name: d.name,
                    type: d.debtType,
                    balance: parseFloat(d.currentBalance),
                    apr: parseFloat(d.annualRate),
                    monthlyPayment: parseFloat(d.monthlyPayment)
                })),
                debtPayoffs: allPayoffs,
                freedomDate,
                timeline,
                summary: {
                    totalDebts: userDebts.length,
                    totalBalance,
                    totalMonthlyPayment,
                    totalInterestRemaining: Math.round(totalInterestRemaining * 100) / 100,
                    monthsToFreedom: (freedomDate - new Date()) / (30.44 * 24 * 60 * 60 * 1000)
                }
            };
        } catch (error) {
            logError(`Failed to generate timeline: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate detailed timeline for a single debt
     */
    async generateTimelineForDebt(tenantId, userId, debtId) {
        try {
            const debt = await db.query.debts.findFirst({
                where: and(eq(debts.id, debtId), eq(debts.userId, userId))
            });

            if (!debt) throw new Error('Debt not found');

            const schedule = debtAmortizationService.generateAmortizationSchedule(
                parseFloat(debt.currentBalance),
                parseFloat(debt.annualRate),
                parseFloat(debt.monthlyPayment)
            );

            // Create milestones
            const milestones = this._generateMilestones(debt, schedule);

            // Create annual summary
            const annualSummary = this._summarizeAnnually(schedule.schedule);

            // Calculate half-way mark
            const halfwayMonth = Math.floor(schedule.months / 2);
            const halfwayPayment = schedule.schedule[halfwayMonth - 1];

            return {
                debt: {
                    id: debt.id,
                    name: debt.name,
                    type: debt.debtType,
                    balance: parseFloat(debt.currentBalance),
                    apr: parseFloat(debt.annualRate),
                    monthlyPayment: parseFloat(debt.monthlyPayment)
                },
                payoffDate: schedule.payoffDate,
                totalMonths: schedule.months,
                totalPayments: schedule.totalPayments,
                totalInterest: schedule.totalInterest,
                payoffTimeline: {
                    month0: {
                        date: new Date(),
                        balance: parseFloat(debt.currentBalance),
                        paid: 0
                    },
                    halfway: {
                        month: halfwayMonth,
                        date: halfwayPayment.paymentDate,
                        balance: halfwayPayment.endingBalance,
                        interestPaid: schedule.schedule.slice(0, halfwayMonth).reduce((sum, i) => sum + i.interestAmount, 0)
                    },
                    final: {
                        month: schedule.months,
                        date: schedule.payoffDate,
                        balance: 0,
                        interestPaid: schedule.totalInterest
                    }
                },
                milestones,
                annualSummary
            };
        } catch (error) {
            logError(`Failed to generate debt timeline: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate milestones for debt payoff
     */
    _generateMilestones(debt, schedule) {
        const milestones = [];
        const totalBalance = parseFloat(debt.currentBalance);

        // 25% paid
        const balance25 = totalBalance * 0.25;
        const month25 = schedule.schedule.findIndex(p => p.endingBalance <= balance25);
        if (month25 >= 0) {
            milestones.push({
                type: 'principal_threshold',
                name: '25% paid off',
                month: month25 + 1,
                date: schedule.schedule[month25].paymentDate,
                achieved: false
            });
        }

        // 50% paid
        const balance50 = totalBalance * 0.50;
        const month50 = schedule.schedule.findIndex(p => p.endingBalance <= balance50);
        if (month50 >= 0) {
            milestones.push({
                type: 'principal_threshold',
                name: '50% paid off',
                month: month50 + 1,
                date: schedule.schedule[month50].paymentDate,
                achieved: false
            });
        }

        // 75% paid
        const balance75 = totalBalance * 0.75;
        const month75 = schedule.schedule.findIndex(p => p.endingBalance <= balance75);
        if (month75 >= 0) {
            milestones.push({
                type: 'principal_threshold',
                name: '75% paid off',
                month: month75 + 1,
                date: schedule.schedule[month75].paymentDate,
                achieved: false
            });
        }

        // 100% paid
        milestones.push({
            type: 'debt_payoff',
            name: 'Debt fully paid off',
            month: schedule.months,
            date: schedule.payoffDate,
            achieved: false
        });

        // Interest thresholds
        const totalInterest = schedule.totalInterest;
        const halfInterest = totalInterest/ 2;
        let cumulativeInterest = 0;
        for (let i = 0; i < schedule.schedule.length; i++) {
            cumulativeInterest += schedule.schedule[i].interestAmount;
            if (cumulativeInterest >= halfInterest && !milestones.find(m => m.type === 'interest_threshold')) {
                milestones.push({
                    type: 'interest_threshold',
                    name: '50% of interest paid',
                    month: i + 1,
                    date: schedule.schedule[i].paymentDate,
                    achieved: false
                });
                break;
            }
        }

        return milestones.sort((a, b) => a.month - b.month);
    }

    /**
     * Summarize schedule into annual breakdowns
     */
    _summarizeAnnually(schedule) {
        const annual = [];
        let currentYear = 0;
        let yearlyPayments = 0;
        let yearlyPrincipal = 0;
        let yearlyInterest = 0;
        let yearStartDate = new Date();

        for (let i = 0; i < schedule.length; i++) {
            const item = schedule[i];
            const paymentYear = Math.floor(i / 12);

            if (paymentYear > currentYear) {
                // Save previous year
                if (yearlyPayments > 0) {
                    annual.push({
                        year: currentYear + 1,
                        startDate: new Date(yearStartDate),
                        endDate: new Date(schedule[i - 1].paymentDate),
                        payments: yearlyPayments,
                        totalPayment: parseFloat(yearlyPayments.toFixed(2)),
                        principalPaid: parseFloat(yearlyPrincipal.toFixed(2)),
                        interestPaid: parseFloat(yearlyInterest.toFixed(2))
                    });
                }

                // Start new year
                currentYear = paymentYear;
                yearStartDate = new Date(item.paymentDate);
                yearlyPayments = 0;
                yearlyPrincipal = 0;
                yearlyInterest = 0;
            }

            yearlyPayments += item.paymentAmount;
            yearlyPrincipal += item.principalAmount;
            yearlyInterest += item.interestAmount;
        }

        // Add final year
        if (yearlyPayments > 0) {
            annual.push({
                year: currentYear + 1,
                startDate: yearStartDate,
                endDate: schedule[schedule.length - 1].paymentDate,
                payments: yearlyPayments,
                totalPayment: parseFloat(yearlyPayments.toFixed(2)),
                principalPaid: parseFloat(yearlyPrincipal.toFixed(2)),
                interestPaid: parseFloat(yearlyInterest.toFixed(2))
            });
        }

        return annual;
    }

    /**
     * Create and store milestones
     */
    async storeMilestones(tenantId, userId, debtId, milestones) {
        try {
            const storedMilestones = [];

            for (const milestone of milestones) {
                const [stored] = await db
                    .insert(debtMilestones)
                    .values({
                        tenantId,
                        userId,
                        debtId,
                        milestoneType: milestone.type,
                        milestoneName: milestone.name,
                        expectedDate: milestone.date,
                        isAchieved: false
                    })
                    .returning();

                storedMilestones.push(stored);
            }

            return storedMilestones;
        } catch (error) {
            logError(`Failed to store milestones: ${error.message}`);
            throw error;
        }
    }

    /**
     * Calculate "freedom date" (when all debts will be paid off)
     */
    async calculateFreedomDate(tenantId, userId) {
        try {
            const userDebts = await db.query.debts.findMany({
                where: and(eq(debts.userId, userId), eq(debts.isActive, true))
            });

            if (userDebts.length === 0) return null;

            let latestPayoffDate = null;

            for (const debt of userDebts) {
                const schedule = debtAmortizationService.generateAmortizationSchedule(
                    parseFloat(debt.currentBalance),
                    parseFloat(debt.annualRate),
                    parseFloat(debt.monthlyPayment)
                );

                if (!latestPayoffDate || schedule.payoffDate > latestPayoffDate) {
                    latestPayoffDate = schedule.payoffDate;
                }
            }

            return {
                freedomDate: latestPayoffDate,
                daysRemaining: Math.ceil((latestPayoffDate - new Date()) / (24 * 60 * 60 * 1000)),
                yearsRemaining: ((latestPayoffDate - new Date()) / (365 * 24 * 60 * 60 * 1000)).toFixed(1)
            };
        } catch (error) {
            logError(`Failed to calculate freedom date: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get payoff countdown
     */
    async getPayoffCountdown(tenantId, userId) {
        try {
            const freedomDateInfo = await this.calculateFreedomDate(tenantId, userId);

            if (!freedomDateInfo) return null;

            const totalDebts = await db.query.debts.findMany({
                where: and(eq(debts.userId, userId), eq(debts.isActive, true))
            });

            const totalBalance = totalDebts.reduce((sum, d) => sum + parseFloat(d.currentBalance), 0);
            const totalMonthlyPayment = totalDebts.reduce((sum, d) => sum + parseFloat(d.monthlyPayment), 0);

            return {
                freedomDate: freedomDateInfo.freedomDate,
                daysRemaining: freedomDateInfo.daysRemaining,
                yearsRemaining: freedomDateInfo.yearsRemaining,
                monthsRemaining: Math.ceil(freedomDateInfo.daysRemaining / 30.44),
                totalDebts: totalDebts.length,
                totalBalance: Math.round(totalBalance * 100) / 100,
                totalMonthlyPayment: Math.round(totalMonthlyPayment * 100) / 100,
                estimatedInterestRemaining: totalDebts.reduce((sum, d) => {
                    const schedule = debtAmortizationService.generateAmortizationSchedule(
                        parseFloat(d.currentBalance),
                        parseFloat(d.annualRate),
                        parseFloat(d.monthlyPayment)
                    );
                    return sum + schedule.totalInterest;
                }, 0)
            };
        } catch (error) {
            logError(`Failed to get payoff countdown: ${error.message}`);
            throw error;
        }
    }

    /**
     * Project remaining balance at a specific future date
     */
    async projectBalanceAtDate(tenantId, userId, targetDate) {
        try {
            const userDebts = await db.query.debts.findMany({
                where: and(eq(debts.userId, userId), eq(debts.isActive, true))
            });

            if (userDebts.length === 0) return null;

            const projections = [];
            let totalRemainingBalance = 0;

            for (const debt of userDebts) {
                const schedule = debtAmortizationService.generateAmortizationSchedule(
                    parseFloat(debt.currentBalance),
                    parseFloat(debt.annualRate),
                    parseFloat(debt.monthlyPayment)
                );

                // Find balance at target date
                const monthsUntilTarget = Math.ceil((targetDate - new Date()) / (365.25 / 12 * 24 * 60 * 60 * 1000));
                const payment = schedule.schedule[Math.min(monthsUntilTarget - 1, schedule.schedule.length - 1)] || schedule.schedule[schedule.schedule.length - 1];
                const remainingBalance = payment.endingBalance;
                totalRemainingBalance += remainingBalance;

                projections.push({
                    debtId: debt.id,
                    debtName: debt.name,
                    currentBalance: parseFloat(debt.currentBalance),
                    projectedBalance: remainingBalance,
                    expectedPayoffDate: schedule.payoffDate
                });
            }

            return {
                projectionDate: targetDate,
                projections,
                totalProjectedBalance: Math.round(totalRemainingBalance * 100) / 100
            };
        } catch (error) {
            logError(`Failed to project balance: ${error.message}`);
            throw error;
        }
    }
}

export default new DebtPayoffTimelineService();
