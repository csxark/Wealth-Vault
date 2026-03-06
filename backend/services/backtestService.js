import db from '../config/db.js';
import { replayScenarios, backtestResults, historicalMarketData } from '../db/schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';
import stateReconstructor from './stateReconstructor.js';
import axios from 'axios';

/**
 * Backtest Service - Simulates "What-If" scenarios using historical data
 * Allows users to replay financial decisions with different outcomes
 */
class BacktestService {
    /**
     * Run a backtest scenario
     * @param {string} scenarioId - Scenario ID to execute
     * @returns {Object} Backtest results
     */
    async runBacktest(scenarioId) {
        try {
            const [scenario] = await db.select()
                .from(replayScenarios)
                .where(eq(replayScenarios.id, scenarioId));

            if (!scenario) {
                throw new Error('Scenario not found');
            }

            // Update status to running
            await db.update(replayScenarios)
                .set({ status: 'running' })
                .where(eq(replayScenarios.id, scenarioId));

            // Reconstruct actual state at start date
            const actualState = await stateReconstructor.reconstructState(
                scenario.userId,
                scenario.startDate
            );

            // Simulate what-if changes
            const simulatedState = await this.simulateChanges(
                actualState,
                scenario.whatIfChanges,
                scenario.startDate,
                scenario.endDate
            );

            // Generate timeline comparison
            const timelineData = await this.generateTimeline(
                scenario.userId,
                actualState,
                simulatedState,
                scenario.startDate,
                scenario.endDate
            );

            // Calculate performance metrics
            const performanceMetrics = this.calculatePerformanceMetrics(timelineData);

            // Calculate final net worth difference
            const actualNetWorth = timelineData[timelineData.length - 1].actualValue;
            const simulatedNetWorth = timelineData[timelineData.length - 1].simulatedValue;
            const difference = simulatedNetWorth - actualNetWorth;
            const differencePercent = (difference / actualNetWorth) * 100;

            // Save results
            const [result] = await db.insert(backtestResults).values({
                scenarioId,
                userId: scenario.userId,
                actualNetWorth,
                simulatedNetWorth,
                difference,
                differencePercent,
                timelineData,
                performanceMetrics
            }).returning();

            // Update scenario status
            await db.update(replayScenarios)
                .set({
                    status: 'completed',
                    completedAt: new Date()
                })
                .where(eq(replayScenarios.id, scenarioId));

            return result;
        } catch (error) {
            console.error('Backtest failed:', error);

            // Update scenario status to failed
            await db.update(replayScenarios)
                .set({ status: 'failed' })
                .where(eq(replayScenarios.id, scenarioId));

            throw new Error(`Backtest failed: ${error.message}`);
        }
    }

    /**
     * Simulate what-if changes to account state
     */
    async simulateChanges(baseState, whatIfChanges, startDate, endDate) {
        let simulatedState = JSON.parse(JSON.stringify(baseState.state));

        for (const change of whatIfChanges) {
            switch (change.type) {
                case 'investment':
                    simulatedState = await this.simulateInvestment(
                        simulatedState,
                        change,
                        startDate,
                        endDate
                    );
                    break;
                case 'expense_reduction':
                    simulatedState = this.simulateExpenseReduction(
                        simulatedState,
                        change
                    );
                    break;
                case 'debt_payoff':
                    simulatedState = this.simulateDebtPayoff(
                        simulatedState,
                        change
                    );
                    break;
                case 'income_increase':
                    simulatedState = this.simulateIncomeIncrease(
                        simulatedState,
                        change
                    );
                    break;
            }
        }

        return simulatedState;
    }

    /**
     * Simulate an investment decision
     */
    async simulateInvestment(state, change, startDate, endDate) {
        const { asset, amount, date } = change;

        // Fetch historical price data
        const priceData = await this.getHistoricalPrices(asset, startDate, endDate);

        if (!priceData || priceData.length === 0) {
            console.warn(`No price data found for ${asset}`);
            return state;
        }

        // Calculate investment value over time
        const purchasePrice = priceData.find(p =>
            new Date(p.date) >= new Date(date)
        )?.close || priceData[0].close;

        const finalPrice = priceData[priceData.length - 1].close;
        const quantity = parseFloat(amount) / parseFloat(purchasePrice);
        const finalValue = quantity * parseFloat(finalPrice);

        // Add simulated investment to state
        if (!state.simulatedInvestments) {
            state.simulatedInvestments = [];
        }

        state.simulatedInvestments.push({
            asset,
            quantity,
            purchasePrice,
            purchaseDate: date,
            currentPrice: finalPrice,
            currentValue: finalValue,
            gain: finalValue - parseFloat(amount),
            gainPercent: ((finalValue - parseFloat(amount)) / parseFloat(amount)) * 100
        });

        return state;
    }

    /**
     * Simulate expense reduction
     */
    simulateExpenseReduction(state, change) {
        const { category, reductionPercent } = change;

        if (!state.expenses) return state;

        const categoryExpenses = state.expenses.filter(e => e.categoryId === category);
        const totalSaved = categoryExpenses.reduce((sum, e) => {
            return sum + (parseFloat(e.amount) * (reductionPercent / 100));
        }, 0);

        state.simulatedSavings = (state.simulatedSavings || 0) + totalSaved;

        return state;
    }

    /**
     * Simulate debt payoff
     */
    simulateDebtPayoff(state, change) {
        const { debtId, extraPayment } = change;

        if (!state.debts) return state;

        const debt = state.debts.find(d => d.id === debtId);
        if (!debt) return state;

        // Simple calculation: reduce debt and calculate interest saved
        const monthsToPayoff = Math.ceil(parseFloat(debt.currentBalance) / parseFloat(extraPayment));
        const interestSaved = monthsToPayoff * (parseFloat(debt.apr) / 12 / 100) * parseFloat(debt.currentBalance);

        state.simulatedDebtSavings = (state.simulatedDebtSavings || 0) + interestSaved;

        return state;
    }

    /**
     * Simulate income increase
     */
    simulateIncomeIncrease(state, change) {
        const { increaseAmount, startDate, endDate } = change;

        const months = this.getMonthsBetween(new Date(startDate), new Date(endDate));
        const totalIncrease = parseFloat(increaseAmount) * months;

        state.simulatedIncomeIncrease = (state.simulatedIncomeIncrease || 0) + totalIncrease;

        return state;
    }

    /**
     * Generate daily timeline comparing actual vs simulated
     */
    async generateTimeline(userId, actualState, simulatedState, startDate, endDate) {
        const timeline = [];
        const currentDate = new Date(startDate);
        const end = new Date(endDate);

        while (currentDate <= end) {
            const actualValue = await this.calculateNetWorth(actualState.state, currentDate);
            const simulatedValue = await this.calculateNetWorth(simulatedState, currentDate);

            timeline.push({
                date: new Date(currentDate),
                actualValue,
                simulatedValue,
                difference: simulatedValue - actualValue
            });

            currentDate.setDate(currentDate.getDate() + 1);
        }

        return timeline;
    }

    /**
     * Calculate net worth at a specific date
     */
    async calculateNetWorth(state, date) {
        let netWorth = 0;

        // Add investment values
        if (state.investments) {
            netWorth += state.investments.reduce((sum, i) =>
                sum + parseFloat(i.marketValue || 0), 0
            );
        }

        // Add simulated investment values
        if (state.simulatedInvestments) {
            netWorth += state.simulatedInvestments.reduce((sum, i) =>
                sum + parseFloat(i.currentValue || 0), 0
            );
        }

        // Add savings
        netWorth += state.simulatedSavings || 0;
        netWorth += state.simulatedDebtSavings || 0;
        netWorth += state.simulatedIncomeIncrease || 0;

        // Subtract debts
        if (state.debts) {
            netWorth -= state.debts.reduce((sum, d) =>
                sum + parseFloat(d.currentBalance), 0
            );
        }

        return netWorth;
    }

    /**
     * Calculate performance metrics (Sharpe Ratio, Max Drawdown, Volatility)
     */
    calculatePerformanceMetrics(timelineData) {
        const returns = [];

        for (let i = 1; i < timelineData.length; i++) {
            const dailyReturn = (timelineData[i].simulatedValue - timelineData[i - 1].simulatedValue)
                / timelineData[i - 1].simulatedValue;
            returns.push(dailyReturn);
        }

        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized

        // Sharpe Ratio (assuming 2% risk-free rate)
        const riskFreeRate = 0.02;
        const sharpeRatio = (avgReturn * 252 - riskFreeRate) / volatility;

        // Max Drawdown
        let maxDrawdown = 0;
        let peak = timelineData[0].simulatedValue;

        for (const point of timelineData) {
            if (point.simulatedValue > peak) {
                peak = point.simulatedValue;
            }
            const drawdown = (peak - point.simulatedValue) / peak;
            maxDrawdown = Math.max(maxDrawdown, drawdown);
        }

        return {
            sharpeRatio: sharpeRatio.toFixed(2),
            maxDrawdown: (maxDrawdown * 100).toFixed(2),
            volatility: (volatility * 100).toFixed(2),
            avgDailyReturn: (avgReturn * 100).toFixed(4)
        };
    }

    /**
     * Fetch historical prices from external API or cache
     */
    async getHistoricalPrices(symbol, startDate, endDate) {
        // Check cache first
        const cachedData = await db.select()
            .from(historicalMarketData)
            .where(and(
                eq(historicalMarketData.symbol, symbol),
                gte(historicalMarketData.date, startDate),
                lte(historicalMarketData.date, endDate)
            ))
            .orderBy(historicalMarketData.date, 'asc');

        if (cachedData.length > 0) {
            return cachedData;
        }

        // Fetch from API (CoinGecko for crypto, Yahoo Finance for stocks)
        try {
            const data = await this.fetchFromExternalAPI(symbol, startDate, endDate);

            // Cache the data
            if (data.length > 0) {
                await db.insert(historicalMarketData).values(
                    data.map(d => ({
                        symbol,
                        assetType: this.detectAssetType(symbol),
                        date: d.date,
                        open: d.open,
                        high: d.high,
                        low: d.low,
                        close: d.close,
                        volume: d.volume,
                        source: d.source
                    }))
                );
            }

            return data;
        } catch (error) {
            console.error(`Failed to fetch historical data for ${symbol}:`, error);
            return [];
        }
    }

    /**
     * Fetch from external API (simplified - would need actual API integration)
     */
    async fetchFromExternalAPI(symbol, startDate, endDate) {
        // Placeholder - in production, integrate with CoinGecko, Yahoo Finance, etc.
        console.log(`Fetching ${symbol} data from ${startDate} to ${endDate}`);

        // Return mock data for now
        return [];
    }

    /**
     * Detect asset type from symbol
     */
    detectAssetType(symbol) {
        const cryptoSymbols = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'ADA', 'XRP'];
        return cryptoSymbols.includes(symbol.toUpperCase()) ? 'crypto' : 'stock';
    }

    /**
     * Get months between two dates
     */
    getMonthsBetween(start, end) {
        return (end.getFullYear() - start.getFullYear()) * 12 +
            (end.getMonth() - start.getMonth());
    }
}

export default new BacktestService();
