import db from '../config/db.js';
import { runwayCalculations, cashFlowProjections, expenses, users } from '../db/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

/**
 * Runway Engine - Calculates exact cash flow runway
 * Predicts the exact day user runs out of cash
 */
class RunwayEngine {
    /**
     * Calculate current runway for a user
     */
    async calculateCurrentRunway(userId) {
        try {
            // Get user data
            const [user] = await db.select().from(users).where(eq(users.id, userId));

            if (!user) {
                throw new Error('User not found');
            }

            // Get historical expenses for trend analysis
            const last6Months = new Date();
            last6Months.setMonth(last6Months.getMonth() - 6);

            const historicalExpenses = await db.select()
                .from(expenses)
                .where(and(
                    eq(expenses.userId, userId),
                    gte(expenses.date, last6Months),
                    eq(expenses.status, 'completed')
                ))
                .orderBy(desc(expenses.date));

            // Calculate monthly averages
            const monthlyData = this.calculateMonthlyAverages(historicalExpenses);

            // Get current balance (from user profile or calculate)
            const currentBalance = parseFloat(user.emergencyFund || 0) +
                parseFloat(user.monthlyBudget || 0);

            const monthlyIncome = parseFloat(user.monthlyIncome || 0);
            const monthlyExpenses = monthlyData.avgMonthlyExpenses;

            // Calculate burn rate
            const monthlyBurnRate = monthlyExpenses - monthlyIncome;

            // Generate daily projections
            const projections = this.generateDailyProjections({
                currentBalance,
                monthlyIncome,
                monthlyExpenses,
                monthlyBurnRate
            });

            // Find critical dates
            const { runwayDays, zeroBalanceDate, criticalThresholdDate } =
                this.findCriticalDates(projections, currentBalance);

            return {
                currentBalance,
                monthlyIncome,
                monthlyExpenses,
                monthlyBurnRate,
                runwayDays,
                zeroBalanceDate,
                criticalThresholdDate,
                dailyProjections: projections,
                trend: monthlyData.trend,
                confidence: this.calculateConfidence(historicalExpenses)
            };
        } catch (error) {
            console.error('Runway calculation failed:', error);
            throw new Error(`Failed to calculate runway: ${error.message}`);
        }
    }

    /**
     * Calculate monthly expense averages and trends
     */
    calculateMonthlyAverages(expenses) {
        if (expenses.length === 0) {
            return {
                avgMonthlyExpenses: 0,
                trend: 'stable',
                volatility: 0
            };
        }

        // Group by month
        const monthlyTotals = {};

        expenses.forEach(expense => {
            const month = new Date(expense.date).toISOString().slice(0, 7); // YYYY-MM
            if (!monthlyTotals[month]) {
                monthlyTotals[month] = 0;
            }
            monthlyTotals[month] += parseFloat(expense.amount);
        });

        const totals = Object.values(monthlyTotals);
        const avgMonthlyExpenses = totals.reduce((sum, val) => sum + val, 0) / totals.length;

        // Calculate trend
        const trend = this.calculateTrend(totals);

        // Calculate volatility (standard deviation)
        const variance = totals.reduce((sum, val) =>
            sum + Math.pow(val - avgMonthlyExpenses, 2), 0
        ) / totals.length;
        const volatility = Math.sqrt(variance);

        return {
            avgMonthlyExpenses,
            trend,
            volatility
        };
    }

    /**
     * Calculate expense trend
     */
    calculateTrend(monthlyTotals) {
        if (monthlyTotals.length < 2) return 'stable';

        const firstHalf = monthlyTotals.slice(0, Math.floor(monthlyTotals.length / 2));
        const secondHalf = monthlyTotals.slice(Math.floor(monthlyTotals.length / 2));

        const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

        const change = ((secondAvg - firstAvg) / firstAvg) * 100;

        if (change > 10) return 'increasing';
        if (change < -10) return 'decreasing';
        return 'stable';
    }

    /**
     * Generate daily cash flow projections
     */
    generateDailyProjections(params) {
        const { currentBalance, monthlyIncome, monthlyExpenses, monthlyBurnRate } = params;

        const projections = [];
        let balance = currentBalance;
        const dailyIncome = monthlyIncome / 30;
        const dailyExpenses = monthlyExpenses / 30;
        const dailyBurnRate = monthlyBurnRate / 30;

        // Project for up to 2 years or until balance hits zero
        const maxDays = 730;

        for (let day = 0; day < maxDays; day++) {
            const date = new Date();
            date.setDate(date.getDate() + day);

            balance -= dailyBurnRate;

            projections.push({
                date: date.toISOString().split('T')[0],
                balance: Math.max(0, balance),
                income: dailyIncome,
                expenses: dailyExpenses,
                netCashFlow: dailyIncome - dailyExpenses
            });

            if (balance <= 0) {
                break;
            }
        }

        return projections;
    }

    /**
     * Find critical dates in projections
     */
    findCriticalDates(projections, initialBalance) {
        let zeroBalanceDate = null;
        let criticalThresholdDate = null;
        let runwayDays = projections.length;

        const criticalThreshold = initialBalance * 0.2; // 20% of initial balance

        for (let i = 0; i < projections.length; i++) {
            const projection = projections[i];

            if (projection.balance <= criticalThreshold && !criticalThresholdDate) {
                criticalThresholdDate = new Date(projection.date);
            }

            if (projection.balance <= 0 && !zeroBalanceDate) {
                zeroBalanceDate = new Date(projection.date);
                runwayDays = i;
                break;
            }
        }

        // If never hits zero, set to max projection date
        if (!zeroBalanceDate && projections.length > 0) {
            zeroBalanceDate = new Date(projections[projections.length - 1].date);
        }

        return {
            runwayDays,
            zeroBalanceDate,
            criticalThresholdDate
        };
    }

    /**
     * Calculate confidence score for projections
     */
    calculateConfidence(expenses) {
        if (expenses.length < 30) return 0.5; // Low confidence with limited data
        if (expenses.length < 90) return 0.7; // Medium confidence
        return 0.9; // High confidence with 3+ months of data
    }

    /**
     * Generate cash flow forecast using AI/ML
     */
    async generateForecast(userId, daysAhead = 90) {
        try {
            const runway = await this.calculateCurrentRunway(userId);

            // Use simple moving average for now (can be replaced with ARIMA/LSTM)
            const forecast = [];
            const baseProjections = runway.dailyProjections.slice(0, daysAhead);

            baseProjections.forEach(projection => {
                forecast.push({
                    date: projection.date,
                    projectedIncome: projection.income,
                    projectedExpenses: projection.expenses,
                    projectedBalance: projection.balance,
                    confidence: runway.confidence,
                    modelType: 'moving_average'
                });
            });

            // Save forecasts to database
            const forecastRecords = forecast.map(f => ({
                userId,
                projectionDate: new Date(f.date),
                projectedIncome: f.projectedIncome.toString(),
                projectedExpenses: f.projectedExpenses.toString(),
                projectedBalance: f.projectedBalance.toString(),
                confidence: f.confidence,
                modelType: f.modelType
            }));

            await db.insert(cashFlowProjections).values(forecastRecords);

            return forecast;
        } catch (error) {
            console.error('Forecast generation failed:', error);
            throw error;
        }
    }

    /**
     * Get runway status summary
     */
    getRunwayStatus(runwayDays) {
        if (runwayDays < 30) {
            return {
                status: 'critical',
                color: 'red',
                message: 'Critical: Less than 30 days of runway',
                urgency: 'immediate'
            };
        } else if (runwayDays < 90) {
            return {
                status: 'warning',
                color: 'orange',
                message: 'Warning: Less than 90 days of runway',
                urgency: 'high'
            };
        } else if (runwayDays < 180) {
            return {
                status: 'caution',
                color: 'yellow',
                message: 'Caution: Less than 6 months of runway',
                urgency: 'medium'
            };
        } else {
            return {
                status: 'healthy',
                color: 'green',
                message: 'Healthy: 6+ months of runway',
                urgency: 'low'
            };
        }
    }

    /**
     * Calculate days to specific balance target
     */
    calculateDaysToTarget(projections, targetBalance) {
        for (let i = 0; i < projections.length; i++) {
            if (projections[i].balance <= targetBalance) {
                return {
                    days: i,
                    date: new Date(projections[i].date),
                    balance: projections[i].balance
                };
            }
        }

        return null; // Target never reached
    }

    /**
     * Simulate scenario impact on runway
     */
    simulateScenarioImpact(currentRunway, scenarioChanges) {
        const adjustedParams = {
            currentBalance: currentRunway.currentBalance,
            monthlyIncome: currentRunway.monthlyIncome * (1 - (scenarioChanges.incomeReduction || 0) / 100),
            monthlyExpenses: currentRunway.monthlyExpenses * (1 + (scenarioChanges.expenseIncrease || 0) / 100),
            monthlyBurnRate: 0
        };

        adjustedParams.monthlyBurnRate = adjustedParams.monthlyExpenses - adjustedParams.monthlyIncome;

        const newProjections = this.generateDailyProjections(adjustedParams);
        const { runwayDays, zeroBalanceDate } = this.findCriticalDates(
            newProjections,
            adjustedParams.currentBalance
        );

        return {
            originalRunwayDays: currentRunway.runwayDays,
            newRunwayDays: runwayDays,
            impact: currentRunway.runwayDays - runwayDays,
            impactPercent: ((currentRunway.runwayDays - runwayDays) / currentRunway.runwayDays) * 100,
            newZeroBalanceDate: zeroBalanceDate
        };
    }
}

export default new RunwayEngine();
