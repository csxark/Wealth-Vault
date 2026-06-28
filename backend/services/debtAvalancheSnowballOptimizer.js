/**
 * Debt Avalanche vs Snowball Optimizer with Hybrid Strategy
 * Issue #738
 * 
 * Calculates optimal debt payoff strategies considering:
 * - Financial efficiency (avalanche - highest interest first)
 * - Psychological motivation (snowball - smallest balance first)
 * - Hybrid approaches balancing both factors
 * - Detailed comparison with trade-off analysis
 */

import db from '../config/db.js';
import { debts } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

class DebtAvalancheSnowballOptimizer {
    /**
     * Main entry point: Calculate all strategies and compare
     * @param {string} userId - User ID
     * @param {number} extraMonthlyPayment - Extra payment available per month
     * @param {object} options - Additional options (riskTolerance, priorities)
     * @returns {object} Complete comparison with recommendations
     */
    async calculateOptimalStrategy(userId, extraMonthlyPayment = 0, options = {}) {
        try {
            const { riskTolerance = 'balanced', psychologicalPriority = 'medium' } = options;

            // Get all active debts
            const userDebts = await this.getUserDebts(userId);

            if (userDebts.length === 0) {
                return {
                    success: false,
                    message: 'No active debts found'
                };
            }

            // Calculate all three strategies
            const avalancheResult = await this.calculateAvalancheStrategy(userDebts, extraMonthlyPayment);
            const snowballResult = await this.calculateSnowballStrategy(userDebts, extraMonthlyPayment);
            const hybridResult = await this.calculateHybridStrategy(userDebts, extraMonthlyPayment, {
                psychologicalWeight: this.getPsychologicalWeight(psychologicalPriority)
            });

            // Generate side-by-side comparison
            const comparison = this.generateComparison(avalancheResult, snowballResult, hybridResult);

            // Get recommendation based on user profile
            const recommendation = this.generateRecommendation(
                userDebts,
                { avalancheResult, snowballResult, hybridResult },
                { riskTolerance, psychologicalPriority }
            );

            return {
                success: true,
                debts: userDebts.map(d => ({
                    id: d.id,
                    name: d.name,
                    balance: d.balance,
                    interestRate: d.interestRate,
                    minimumPayment: d.minimumPayment
                })),
                extraMonthlyPayment,
                strategies: {
                    avalanche: avalancheResult,
                    snowball: snowballResult,
                    hybrid: hybridResult
                },
                comparison,
                recommendation,
                calculatedAt: new Date()
            };
        } catch (error) {
            console.error('Error calculating optimal strategy:', error);
            throw error;
        }
    }

    /**
     * Get user's active debts
     */
    async getUserDebts(userId) {
        const dbDebts = await db.query.debts.findMany({
            where: and(
                eq(debts.userId, userId),
                eq(debts.isActive, true)
            )
        });

        // Normalize debt data
        return dbDebts.map(d => ({
            id: d.id,
            name: d.name || d.type || 'Unnamed Debt',
            balance: parseFloat(d.currentBalance || d.balance || 0),
            interestRate: parseFloat(d.apr || d.annualRate || d.interestRate || 0),
            minimumPayment: parseFloat(d.minimumPayment || d.monthlyPayment || 0),
            type: d.type || 'other'
        })).filter(d => d.balance > 0);
    }

    /**
     * Calculate Avalanche Strategy (Highest Interest First)
     * Minimizes total interest paid but may take longer for first payoff
     */
    async calculateAvalancheStrategy(debts, extraMonthlyPayment = 0) {
        // Sort by interest rate (highest first)
        const sortedDebts = [...debts].sort((a, b) => b.interestRate - a.interestRate);

        return await this.simulatePayoffPlan({
            debts: sortedDebts,
            priorityOrder: sortedDebts.map(d => d.id),
            extraMonthlyPayment,
            strategyName: 'avalanche',
            description: 'Pay highest interest rate debts first to minimize total interest paid'
        });
    }

    /**
     * Calculate Snowball Strategy (Smallest Balance First)
     * Maximizes psychological wins with quick payoffs
     */
    async calculateSnowballStrategy(debts, extraMonthlyPayment = 0) {
        // Sort by balance (smallest first)
        const sortedDebts = [...debts].sort((a, b) => a.balance - b.balance);

        return await this.simulatePayoffPlan({
            debts: sortedDebts,
            priorityOrder: sortedDebts.map(d => d.id),
            extraMonthlyPayment,
            strategyName: 'snowball',
            description: 'Pay smallest balance debts first for quick wins and motivation'
        });
    }

    /**
     * Calculate Hybrid Strategy
     * Balances financial efficiency with psychological factors
     * @param {number} options.psychologicalWeight - Weight for psychological factors (0-1)
     */
    async calculateHybridStrategy(debts, extraMonthlyPayment = 0, options = {}) {
        const { psychologicalWeight = 0.4 } = options;
        const financialWeight = 1 - psychologicalWeight;

        // Normalize factors for scoring
        const maxBalance = Math.max(...debts.map(d => d.balance));
        const maxInterestRate = Math.max(...debts.map(d => d.interestRate));

        // Score each debt
        const scoredDebts = debts.map(d => {
            // Financial score: Higher interest rate = higher priority
            const interestScore = maxInterestRate > 0 ? d.interestRate / maxInterestRate : 0;
            
            // Psychological score: Smaller balance = higher priority (inverse)
            const balanceScore = maxBalance > 0 ? 1 - (d.balance / maxBalance) : 0;
            
            // Combined score
            const hybridScore = (financialWeight * interestScore) + (psychologicalWeight * balanceScore);

            return {
                ...d,
                scores: {
                    interest: interestScore.toFixed(3),
                    balance: balanceScore.toFixed(3),
                    hybrid: hybridScore.toFixed(3)
                },
                hybridScore
            };
        });

        // Sort by hybrid score (highest first)
        const sortedDebts = scoredDebts.sort((a, b) => b.hybridScore - a.hybridScore);

        return await this.simulatePayoffPlan({
            debts: sortedDebts,
            priorityOrder: sortedDebts.map(d => d.id),
            extraMonthlyPayment,
            strategyName: 'hybrid',
            description: `Balanced approach: ${Math.round(financialWeight * 100)}% focus on interest rate, ${Math.round(psychologicalWeight * 100)}% focus on quick wins`,
            scoringDetails: {
                financialWeight,
                psychologicalWeight,
                debtScores: sortedDebts.map(d => ({
                    name: d.name,
                    scores: d.scores
                }))
            }
        });
    }

    /**
     * Simulate complete debt payoff plan
     * Returns month-by-month amortization schedule with detailed metrics
     */
    async simulatePayoffPlan({ debts, priorityOrder, extraMonthlyPayment, strategyName, description, scoringDetails = null }) {
        // Initialize debt states
        let activeDebts = debts.map(d => ({
            id: d.id,
            name: d.name,
            originalBalance: d.balance,
            balance: d.balance,
            interestRate: d.interestRate,
            minimumPayment: d.minimumPayment,
            totalPaid: 0,
            totalInterest: 0,
            totalPrincipal: 0,
            isPaidOff: false,
            paidOffMonth: null
        }));

        const monthlySchedule = [];
        const milestones = [];
        let currentMonth = 0;
        let totalInterestPaid = 0;
        let totalPrincipalPaid = 0;
        let totalPayments = 0;
        const maxMonths = 600; // 50 years max

        // Track snowball effect (freed-up payments from paid off debts)
        let snowballBonus = 0;

        while (activeDebts.some(d => !d.isPaidOff) && currentMonth < maxMonths) {
            currentMonth++;
            let monthlyInterest = 0;
            let monthlyPrincipal = 0;
            let monthlyPayment = 0;
            let extraPaymentRemaining = extraMonthlyPayment + snowballBonus;

            const monthDate = new Date();
            monthDate.setMonth(monthDate.getMonth() + currentMonth);

            // Step 1: Apply interest and minimum payments to all active debts
            for (let debt of activeDebts) {
                if (debt.isPaidOff) continue;

                // Calculate monthly interest
                const interest = (debt.balance * (debt.interestRate / 100)) / 12;
                monthlyInterest += interest;
                debt.totalInterest += interest;

                // Calculate minimum payment (interest + principal)
                let payment = Math.min(debt.minimumPayment, debt.balance + interest);
                let principal = Math.max(0, payment - interest);

                // Update debt balance
                debt.balance -= principal;
                debt.totalPaid += payment;
                debt.totalPrincipal += principal;

                monthlyPrincipal += principal;
                monthlyPayment += payment;
            }

            // Step 2: Apply extra payment to prioritized debts
            for (let debtId of priorityOrder) {
                if (extraPaymentRemaining <= 0) break;

                const debt = activeDebts.find(d => d.id === debtId);
                if (!debt || debt.isPaidOff) continue;

                // Apply extra payment
                const extraApplied = Math.min(debt.balance, extraPaymentRemaining);
                debt.balance -= extraApplied;
                debt.totalPaid += extraApplied;
                debt.totalPrincipal += extraApplied;

                monthlyPrincipal += extraApplied;
                monthlyPayment += extraApplied;
                extraPaymentRemaining -= extraApplied;

                // Check if debt is now paid off
                if (debt.balance <= 0.01 && !debt.isPaidOff) {
                    debt.isPaidOff = true;
                    debt.paidOffMonth = currentMonth;
                    debt.balance = 0;

                    // Add to snowball: freed-up minimum payment
                    snowballBonus += debt.minimumPayment;

                    milestones.push({
                        month: currentMonth,
                        monthDate,
                        type: 'debt_payoff',
                        debtName: debt.name,
                        originalBalance: debt.originalBalance,
                        totalInterestPaid: debt.totalInterest,
                        totalPaid: debt.totalPaid,
                        freedUpPayment: debt.minimumPayment,
                        message: `Paid off ${debt.name}! $${debt.minimumPayment.toFixed(2)}/month freed up for other debts.`
                    });
                }
            }

            totalInterestPaid += monthlyInterest;
            totalPrincipalPaid += monthlyPrincipal;
            totalPayments += monthlyPayment;

            // Record monthly snapshot
            const remainingBalance = activeDebts.reduce((sum, d) => sum + d.balance, 0);
            const debtsRemaining = activeDebts.filter(d => !d.isPaidOff).length;

            monthlySchedule.push({
                month: currentMonth,
                monthDate: monthDate.toISOString().split('T')[0],
                payment: parseFloat(monthlyPayment.toFixed(2)),
                principal: parseFloat(monthlyPrincipal.toFixed(2)),
                interest: parseFloat(monthlyInterest.toFixed(2)),
                extraPayment: parseFloat((extraMonthlyPayment + (snowballBonus - extraPaymentRemaining)).toFixed(2)),
                remainingBalance: parseFloat(remainingBalance.toFixed(2)),
                totalInterestPaid: parseFloat(totalInterestPaid.toFixed(2)),
                totalPaid: parseFloat(totalPayments.toFixed(2)),
                debtsRemaining,
                debts: activeDebts.map(d => ({
                    id: d.id,
                    name: d.name,
                    balance: parseFloat(d.balance.toFixed(2)),
                    isPaidOff: d.isPaidOff
                }))
            });

            // Check if all debts are paid off
            if (activeDebts.every(d => d.isPaidOff)) {
                milestones.push({
                    month: currentMonth,
                    monthDate,
                    type: 'debt_freedom',
                    message: `🎉 DEBT FREE! All debts paid off in ${currentMonth} months!`
                });
                break;
            }
        }

        // Calculate final metrics
        const freedomDate = currentMonth < maxMonths ? monthlySchedule[monthlySchedule.length - 1].monthDate : null;
        const payoffTimeline = activeDebts
            .filter(d => d.isPaidOff)
            .sort((a, b) => a.paidOffMonth - b.paidOffMonth)
            .map(d => ({
                debtName: d.name,
                originalBalance: d.originalBalance,
                paidOffMonth: d.paidOffMonth,
                totalInterestPaid: parseFloat(d.totalInterest.toFixed(2)),
                totalPaid: parseFloat(d.totalPaid.toFixed(2))
            }));

        return {
            strategyName,
            description,
            scoringDetails,
            summary: {
                totalMonths: currentMonth,
                totalYears: parseFloat((currentMonth / 12).toFixed(1)),
                freedomDate,
                totalInterestPaid: parseFloat(totalInterestPaid.toFixed(2)),
                totalPrincipalPaid: parseFloat(totalPrincipalPaid.toFixed(2)),
                totalPaid: parseFloat(totalPayments.toFixed(2)),
                averageMonthlyPayment: parseFloat((totalPayments / currentMonth).toFixed(2)),
                debtsCleared: payoffTimeline.length,
                firstDebtPaidOffMonth: payoffTimeline.length > 0 ? payoffTimeline[0].paidOffMonth : null
            },
            payoffOrder: priorityOrder.map(id => {
                const debt = activeDebts.find(d => d.id === id);
                return {
                    id: debt.id,
                    name: debt.name,
                    originalBalance: debt.originalBalance,
                    interestRate: debt.interestRate
                };
            }),
            payoffTimeline,
            milestones,
            monthlySchedule: currentMonth <= 120 ? monthlySchedule : monthlySchedule.filter((_, i) => i % 3 === 0 || i === monthlySchedule.length - 1), // Sample for long timelines
            motivationalMetrics: this.calculateMotivationalMetrics(milestones, currentMonth)
        };
    }

    /**
     * Calculate motivational metrics
     */
    calculateMotivationalMetrics(milestones, totalMonths) {
        const payoffMilestones = milestones.filter(m => m.type === 'debt_payoff');
        
        if (payoffMilestones.length === 0) {
            return {
                quickWins: 0,
                averageMonthsBetweenWins: 0,
                longestWaitForFirstWin: 0,
                momentumScore: 0
            };
        }

        const firstWin = payoffMilestones[0].month;
        const averageGap = payoffMilestones.length > 1
            ? (totalMonths - firstWin) / (payoffMilestones.length - 1)
            : 0;

        // Momentum score: earlier wins and more frequent wins = higher momentum
        // Scale from 0-100
        const momentumScore = Math.min(100, Math.round(
            (1 / (firstWin / 12)) * 30 + // Earlier first win is better
            (payoffMilestones.length / (totalMonths / 12)) * 70 // More payoffs per year is better
        ));

        return {
            quickWins: payoffMilestones.length,
            averageMonthsBetweenWins: parseFloat(averageGap.toFixed(1)),
            longestWaitForFirstWin: firstWin,
            momentumScore,
            psychologicalBenefit: momentumScore > 70 ? 'High' : momentumScore > 40 ? 'Medium' : 'Low'
        };
    }

    /**
     * Generate side-by-side comparison
     */
    generateComparison(avalancheResult, snowballResult, hybridResult) {
        const baselineSavings = avalancheResult.summary.totalInterestPaid; // Avalanche is the financial benchmark

        return {
            summaryTable: [
                {
                    strategy: 'Avalanche (Highest Interest First)',
                    totalMonths: avalancheResult.summary.totalMonths,
                    totalYears: avalancheResult.summary.totalYears,
                    totalInterest: avalancheResult.summary.totalInterestPaid,
                    interestVsAvalanche: 0,
                    firstPayoffMonth: avalancheResult.summary.firstDebtPaidOffMonth,
                    momentumScore: avalancheResult.motivationalMetrics.momentumScore,
                    pros: ['Lowest total interest', 'Mathematically optimal', 'Fastest if high-rate debt is small'],
                    cons: ['First win may take longer', 'Requires discipline', 'Less psychological reinforcement']
                },
                {
                    strategy: 'Snowball (Smallest Balance First)',
                    totalMonths: snowballResult.summary.totalMonths,
                    totalYears: snowballResult.summary.totalYears,
                    totalInterest: snowballResult.summary.totalInterestPaid,
                    interestVsAvalanche: parseFloat((snowballResult.summary.totalInterestPaid - baselineSavings).toFixed(2)),
                    firstPayoffMonth: snowballResult.summary.firstDebtPaidOffMonth,
                    momentumScore: snowballResult.motivationalMetrics.momentumScore,
                    pros: ['Quick wins build momentum', 'High motivation', 'Simplifies finances faster'],
                    cons: ['May cost more in interest', 'Not mathematically optimal', 'Depends on balance distribution']
                },
                {
                    strategy: 'Hybrid (Balanced Approach)',
                    totalMonths: hybridResult.summary.totalMonths,
                    totalYears: hybridResult.summary.totalYears,
                    totalInterest: hybridResult.summary.totalInterestPaid,
                    interestVsAvalanche: parseFloat((hybridResult.summary.totalInterestPaid - baselineSavings).toFixed(2)),
                    firstPayoffMonth: hybridResult.summary.firstDebtPaidOffMonth,
                    momentumScore: hybridResult.motivationalMetrics.momentumScore,
                    pros: ['Balances savings and motivation', 'Adaptive to debt mix', 'Good compromise'],
                    cons: ['Not best at any single metric', 'Slightly more complex', 'May confuse some users']
                }
            ],
            tradeoffAnalysis: {
                interestSavings: {
                    best: 'Avalanche',
                    avalancheVsSnowball: parseFloat((snowballResult.summary.totalInterestPaid - avalancheResult.summary.totalInterestPaid).toFixed(2)),
                    avalancheVsHybrid: parseFloat((hybridResult.summary.totalInterestPaid - avalancheResult.summary.totalInterestPaid).toFixed(2)),
                    message: snowballResult.summary.totalInterestPaid > avalancheResult.summary.totalInterestPaid
                        ? `Avalanche saves $${(snowballResult.summary.totalInterestPaid - avalancheResult.summary.totalInterestPaid).toFixed(2)} vs Snowball`
                        : 'Both strategies have similar interest costs'
                },
                motivation: {
                    best: snowballResult.motivationalMetrics.momentumScore > avalancheResult.motivationalMetrics.momentumScore ? 'Snowball' : 'Avalanche',
                    snowballScore: snowballResult.motivationalMetrics.momentumScore,
                    avalancheScore: avalancheResult.motivationalMetrics.momentumScore,
                    hybridScore: hybridResult.motivationalMetrics.momentumScore,
                    message: `Snowball provides ${Math.abs(snowballResult.motivationalMetrics.momentumScore - avalancheResult.motivationalMetrics.momentumScore)} points more momentum`
                },
                timeToDebtFree: {
                    fastest: [avalancheResult, snowballResult, hybridResult]
                        .sort((a, b) => a.summary.totalMonths - b.summary.totalMonths)[0]
                        .strategyName,
                    avalancheMonths: avalancheResult.summary.totalMonths,
                    snowballMonths: snowballResult.summary.totalMonths,
                    hybridMonths: hybridResult.summary.totalMonths,
                    monthsDifference: Math.abs(avalancheResult.summary.totalMonths - snowballResult.summary.totalMonths)
                }
            },
            visualization: {
                description: 'Compare cumulative interest paid over time across all strategies',
                note: 'Use monthly schedules for detailed timeline visualization'
            }
        };
    }

    /**
     * Generate personalized recommendation
     */
    generateRecommendation(debts, strategies, userProfile) {
        const { riskTolerance, psychologicalPriority } = userProfile;
        const { avalancheResult, snowballResult, hybridResult } = strategies;

        // Analyze debt profile
        const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
        const avgInterestRate = debts.reduce((sum, d) => sum + d.interestRate, 0) / debts.length;
        const highInterestDebts = debts.filter(d => d.interestRate > 15).length;
        const smallDebts = debts.filter(d => d.balance < 2000).length;
        const interestSavings = snowballResult.summary.totalInterestPaid - avalancheResult.summary.totalInterestPaid;
        const interestSavingsPercent = (interestSavings / avalancheResult.summary.totalInterestPaid) * 100;

        let recommendedStrategy = 'hybrid';
        let confidence = 'medium';
        let reasons = [];
        let warnings = [];

        // Decision logic
        if (highInterestDebts > 0 && avgInterestRate > 12 && interestSavingsPercent > 15) {
            // Strong financial case for avalanche
            recommendedStrategy = 'avalanche';
            confidence = 'high';
            reasons.push(`High interest rates detected (avg ${avgInterestRate.toFixed(1)}%)`);
            reasons.push(`Avalanche saves $${interestSavings.toFixed(2)} in interest vs Snowball`);
            reasons.push('Financial optimization is critical with high-rate debt');
            
            if (psychologicalPriority === 'high') {
                warnings.push('⚠️ Consider hybrid if you need early wins for motivation');
            }
        } else if (smallDebts >= 2 && psychologicalPriority === 'high' && interestSavingsPercent < 10) {
            // Strong psychological case for snowball
            recommendedStrategy = 'snowball';
            confidence = 'high';
            reasons.push(`${smallDebts} small debts can be paid off quickly`);
            reasons.push(`Interest cost difference is minimal ($${interestSavings.toFixed(2)})`);
            reasons.push('Quick wins will build momentum and motivation');
            reasons.push(`Momentum score: ${snowballResult.motivationalMetrics.momentumScore}/100`);
        } else if (debts.length > 3 && interestSavingsPercent > 5 && interestSavingsPercent < 20) {
            // Hybrid makes sense
            recommendedStrategy = 'hybrid';
            confidence = 'high';
            reasons.push('Multiple debts with mixed characteristics');
            reasons.push('Hybrid balances interest savings with psychological wins');
            reasons.push(`Moderate interest difference: $${Math.abs(hybridResult.summary.totalInterestPaid - avalancheResult.summary.totalInterestPaid).toFixed(2)}`);
            reasons.push(`Better momentum than avalanche: ${hybridResult.motivationalMetrics.momentumScore} vs ${avalancheResult.motivationalMetrics.momentumScore}`);
        } else {
            // Default to user's risk tolerance
            if (riskTolerance === 'conservative' || psychologicalPriority === 'low') {
                recommendedStrategy = 'avalanche';
                reasons.push('Conservative approach: minimize interest costs');
            } else {
                recommendedStrategy = 'snowball';
                reasons.push('Motivation-focused approach for sustained progress');
            }
            confidence = 'medium';
        }

        const recommended = strategies[`${recommendedStrategy}Result`];

        return {
            recommendedStrategy,
            confidence,
            reasons,
            warnings,
            summary: {
                strategy: recommendedStrategy.charAt(0).toUpperCase() + recommendedStrategy.slice(1),
                timeToDebtFree: `${recommended.summary.totalYears} years (${recommended.summary.totalMonths} months)`,
                totalInterest: `$${recommended.summary.totalInterestPaid.toFixed(2)}`,
                monthlyPayment: `$${recommended.summary.averageMonthlyPayment.toFixed(2)}`,
                firstPayoffMonth: recommended.summary.firstDebtPaidOffMonth,
                momentumScore: `${recommended.motivationalMetrics.momentumScore}/100`
            },
            debtProfile: {
                totalDebts: debts.length,
                totalBalance: `$${totalDebt.toFixed(2)}`,
                averageInterestRate: `${avgInterestRate.toFixed(2)}%`,
                highInterestDebts,
                smallDebts
            },
            alternativeConsiderations: this.getAlternativeConsiderations(strategies, recommendedStrategy, debts),
            actionPlan: this.generateActionPlan(recommended, debts)
        };
    }

    /**
     * Get alternative considerations
     */
    getAlternativeConsiderations(strategies, recommended, debts) {
        const alternatives = [];

        if (recommended !== 'avalanche') {
            const savings = strategies.snowballResult.summary.totalInterestPaid - strategies.avalancheResult.summary.totalInterestPaid;
            if (savings > 500) {
                alternatives.push({
                    strategy: 'Avalanche',
                    benefit: `Save $${savings.toFixed(2)} in interest`,
                    tradeoff: 'May take longer for first payoff win'
                });
            }
        }

        if (recommended !== 'snowball') {
            const firstPayoff = strategies.snowballResult.summary.firstDebtPaidOffMonth;
            if (firstPayoff < 6) {
                alternatives.push({
                    strategy: 'Snowball',
                    benefit: `First debt paid off in ${firstPayoff} months`,
                    tradeoff: 'Slightly higher total interest'
                });
            }
        }

        if (recommended !== 'hybrid' && debts.length > 3) {
            alternatives.push({
                strategy: 'Hybrid',
                benefit: 'Best balance of savings and motivation',
                tradeoff: 'Moderate performance on all metrics'
            });
        }

        return alternatives;
    }

    /**
     * Generate month-by-month action plan
     */
    generateActionPlan(strategy, debts) {
        const plan = {
            immediateActions: [
                'Review your current debt obligations and ensure accuracy',
                `Set up automatic payments for minimum amounts on all debts`,
                `Allocate extra payment to: ${strategy.payoffOrder[0].name}`
            ],
            monthlyRoutine: [
                `Pay minimums on all ${debts.length} debts`,
                `Apply extra payment to current priority debt`,
                'Track progress and celebrate milestones',
                'Review and adjust if income/expenses change'
            ],
            upcomingMilestones: strategy.milestones.slice(0, 5).map(m => ({
                month: m.month,
                event: m.message
            })),
            tipsForSuccess: [
                '⚡ Automate minimum payments to avoid late fees',
                '💪 Redirect any windfalls (tax refunds, bonuses) to debt',
                '📊 Review progress monthly to stay motivated',
                '🎯 Don\'t add new debt while paying off existing balances',
                '🔄 When a debt is paid off, immediately redirect that payment to the next priority'
            ]
        };

        return plan;
    }

    /**
     * Get psychological weight from priority level
     */
    getPsychologicalWeight(priority) {
        const weights = {
            'low': 0.2,
            'medium': 0.4,
            'high': 0.6,
            'very_high': 0.75
        };
        return weights[priority] || 0.4;
    }

    /**
     * Compare specific strategies
     * Utility method for comparing any two strategies
     */
    async compareStrategies(userId, extraMonthlyPayment, strategyNames = ['avalanche', 'snowball', 'hybrid']) {
        const result = await this.calculateOptimalStrategy(userId, extraMonthlyPayment);
        
        if (!result.success) {
            return result;
        }

        const comparison = {};
        strategyNames.forEach(name => {
            if (result.strategies[name]) {
                comparison[name] = result.strategies[name];
            }
        });

        return {
            success: true,
            comparison,
            summary: result.comparison.summaryTable.filter(s => 
                strategyNames.some(name => s.strategy.toLowerCase().includes(name))
            )
        };
    }
}

export default new DebtAvalancheSnowballOptimizer();
