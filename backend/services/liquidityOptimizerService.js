import db from '../config/db.js';
import {
    liquidityProjections,
    liquidityOptimizerActions,
    creditLines,
    investments,
    currencyWallets,
    users,
    expenses
} from '../db/schema.js';
import { eq, and, gte, desc } from 'drizzle-orm';
import runwayEngine from './runwayEngine.js';
import taxService from './taxService.js';

/**
 * Liquidity Optimizer Service (L3)
 * Handles Monte Carlo simulations and automated cash flow re-routing
 */
class LiquidityOptimizerService {
    /**
     * Run Monte Carlo simulation for liquidity
     * @param {string} userId - User ID
     * @param {number} iterations - Number of simulations
     * @param {number} daysAhead - Forecast horizon
     */
    async simulateLiquidity(userId, iterations = 1000, daysAhead = 90) {
        try {
            // Get user current state
            const [user] = await db.select().from(users).where(eq(users.id, userId));
            if (!user) throw new Error('User not found');

            const runway = await runwayEngine.calculateCurrentRunway(userId);

            // Get historical expense volatility
            const historicalExpenses = await db.select()
                .from(expenses)
                .where(eq(expenses.userId, userId));

            const expenseStats = runwayEngine.calculateMonthlyAverages(historicalExpenses);
            // Estimate daily volatility (simplistic approach: monthly vol / sqrt(30))
            const dailyVolatility = (expenseStats.volatility / Math.sqrt(30)) || (parseFloat(runway.monthlyExpenses) * 0.15 / Math.sqrt(30));

            const dailyProjections = new Array(daysAhead).fill(0).map(() => []);

            for (let i = 0; i < iterations; i++) {
                let currentBalance = runway.currentBalance;
                const avgDailyIncome = parseFloat(runway.monthlyIncome) / 30;
                const avgDailyExpense = parseFloat(runway.monthlyExpenses) / 30;

                for (let day = 0; day < daysAhead; day++) {
                    // Monte Carlo: Add randomness to expenses (normally distributed)
                    const randomExpense = this.generateNormalRandom(avgDailyExpense, dailyVolatility);
                    currentBalance += (avgDailyIncome - randomExpense);
                    dailyProjections[day].push(currentBalance);
                }
            }

            // Calculate percentiles and crunch probability
            const finalProjections = [];

            for (let day = 0; day < daysAhead; day++) {
                const dayBalances = dailyProjections[day].sort((a, b) => a - b);
                const p10 = dayBalances[Math.floor(iterations * 0.1)];
                const p50 = dayBalances[Math.floor(iterations * 0.5)];
                const p90 = dayBalances[Math.floor(iterations * 0.9)];

                const crunchProb = dayBalances.filter(b => b <= 0).length / iterations;

                const projectionDate = new Date();
                projectionDate.setDate(projectionDate.getDate() + day);

                finalProjections.push({
                    userId,
                    projectionDate,
                    baseBalance: (runway.dailyProjections[day]?.balance || 0).toString(),
                    p10Balance: p10.toString(),
                    p50Balance: p50.toString(),
                    p90Balance: p90.toString(),
                    liquidityCrunchProbability: crunchProb,
                    simulationMetadata: { iterations, daysAhead }
                });
            }

            // Clear old projections and save new ones
            await db.delete(liquidityProjections).where(eq(liquidityProjections.userId, userId));
            const inserted = await db.insert(liquidityProjections).values(finalProjections).returning();

            return inserted;
        } catch (error) {
            console.error('Liquidity simulation failed:', error);
            throw error;
        }
    }

    /**
     * Generate normal random variable using Box-Muller transform
     */
    generateNormalRandom(mean, stdDev) {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return mean + z * stdDev;
    }

    /**
     * Identify and suggest optimization actions
     * @param {string} userId - User ID
     */
    async suggestActions(userId) {
        try {
            // Get latest projections
            const projections = await db.select()
                .from(liquidityProjections)
                .where(eq(liquidityProjections.userId, userId))
                .orderBy(liquidityProjections.projectionDate);

            // Look for crunches in the next 30 days with > 20% probability
            const imminentRisk = projections.find(p => {
                const daysDiff = (new Date(p.projectionDate) - new Date()) / (1000 * 60 * 60 * 24);
                return daysDiff <= 30 && p.liquidityCrunchProbability > 0.2;
            });

            if (!imminentRisk) return [];

            const actions = [];
            const shortfallAmount = Math.abs(parseFloat(imminentRisk.p10Balance));

            // 1. Analyze Credit Line Arbitrage
            const creditLineActions = await this.analyzeCreditLines(userId, shortfallAmount);
            actions.push(...creditLineActions);

            // 2. Analyze Asset Liquidation
            const assetActions = await this.analyzeAssetLiquidation(userId, shortfallAmount);
            actions.push(...assetActions);

            // Sort by impact score and cost of capital
            const finalActions = actions
                .sort((a, b) => b.impactScore - a.impactScore || a.costOfCapital - b.costOfCapital);

            // Save proposed actions
            if (finalActions.length > 0) {
                await db.insert(liquidityOptimizerActions).values(
                    finalActions.map(a => ({
                        userId,
                        projectionId: imminentRisk.id,
                        ...a,
                        status: 'proposed'
                    }))
                );
            }

            return finalActions;
        } catch (error) {
            console.error('Action suggestion failed:', error);
            throw error;
        }
    }

    /**
     * Analyze available credit lines for liquidity support
     */
    async analyzeCreditLines(userId, amount) {
        const availableLines = await db.select()
            .from(creditLines)
            .where(eq(creditLines.userId, userId));

        const suggestions = [];

        for (const line of availableLines) {
            const remainingLimit = parseFloat(line.creditLimit) - parseFloat(line.currentBalance);
            if (remainingLimit > 0) {
                const drawAmount = Math.min(amount, remainingLimit);
                const interestRate = parseFloat(line.interestRate);

                // Arbitrage logic: If interest rate < 10%, it's a good score
                const impactScore = interestRate < 10 ? 90 : 60;

                suggestions.push({
                    actionType: 'credit_draw',
                    resourceType: 'credit_line',
                    resourceId: line.id,
                    amount: drawAmount.toString(),
                    costOfCapital: interestRate,
                    impactScore,
                    reason: `Draw from ${line.provider} (${line.type}) at ${interestRate}% interest. This is more cost-effective than liquidating long-term assets.`,
                    metadata: { provider: line.provider, type: line.type }
                });
            }
        }

        return suggestions;
    }

    /**
     * Analyze investments for potential liquidation
     */
    async analyzeAssetLiquidation(userId, amount) {
        const userInvestments = await db.select()
            .from(investments)
            .where(and(
                eq(investments.userId, userId),
                eq(investments.isActive, true)
            ));

        const taxProfile = await taxService.getUserTaxProfile(userId);
        const incomeBracket = taxProfile?.estimatedTaxBracket || '22%';
        const suggestions = [];

        for (const inv of userInvestments) {
            const mktVal = parseFloat(inv.marketValue);
            if (mktVal > 0) {
                const sellAmount = Math.min(amount, mktVal);

                // Calculate tax impact
                const costBasis = parseFloat(inv.totalCost) * (sellAmount / mktVal);
                const gain = Math.max(0, sellAmount - costBasis);

                // Estimate if long term (>365 days)
                const isLongTerm = inv.purchaseDate ?
                    (new Date() - new Date(inv.purchaseDate)) > (365 * 24 * 60 * 60 * 1000) : true;

                const estimatedTax = taxService.calculateCapitalGainsTax(gain, isLongTerm, incomeBracket);

                // Simplified cost: Opportunity cost of 7% (average market return)
                const costOfCapital = 7.0;

                suggestions.push({
                    actionType: 'asset_sale',
                    resourceType: 'investment',
                    resourceId: inv.id,
                    amount: sellAmount.toString(),
                    costOfCapital,
                    impactScore: 75,
                    taxImpact: estimatedTax.toString(),
                    reason: `Liquidate ${inv.symbol} (${inv.name}) as a high-liquidity fallback. Estimated tax impact: $${estimatedTax.toFixed(2)}.`,
                    metadata: { symbol: inv.symbol, isLongTerm, estimatedGain: gain }
                });
            }
        }

        return suggestions;
    }

    /**
     * Execute a proposed action
     */
    async executeAction(userId, actionId) {
        try {
            const [action] = await db.select()
                .from(liquidityOptimizerActions)
                .where(and(
                    eq(liquidityOptimizerActions.id, actionId),
                    eq(liquidityOptimizerActions.userId, userId)
                ));

            if (!action) throw new Error('Action not found');
            if (action.status !== 'proposed') throw new Error('Action already processed');

            // In a real system, this would trigger external API calls (Bank/Brokerage)
            // Here we update internal state

            if (action.actionType === 'credit_draw') {
                const [line] = await db.select().from(creditLines).where(eq(creditLines.id, action.resourceId));
                await db.update(creditLines)
                    .set({
                        currentBalance: (parseFloat(line.currentBalance) + parseFloat(action.amount)).toString(),
                        updatedAt: new Date()
                    })
                    .where(eq(creditLines.id, line.id));
            }

            await db.update(liquidityOptimizerActions)
                .set({
                    status: 'executed',
                    executedAt: new Date()
                })
                .where(eq(liquidityOptimizerActions.id, actionId));

            return { success: true, action };
        } catch (error) {
            console.error('Action execution failed:', error);
            throw error;
        }
    }
}

export default new LiquidityOptimizerService();
