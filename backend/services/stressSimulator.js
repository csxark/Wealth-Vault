import { db } from '../db/index.js';
import { expenses, vaults, stressScenarios, users } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

class StressSimulator {
    /**
     * Simulates a financial crisis based on user-defined parameters
     */
    async runSimulation(userId, scenarioId) {
        logInfo(`Running stress simulation for user: ${userId}, Scenario: ${scenarioId}`);

        try {
            const scenario = await db.select()
                .from(stressScenarios)
                .where(eq(stressScenarios.id, scenarioId))
                .limit(1);

            if (scenario.length === 0) throw new Error('Scenario not found');

            const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
            const totalLiquidity = await this.calculateTotalLiquidity(userId);
            const avgMonthlyBurn = await this.calculateMonthlyBurnRate(userId);

            const params = scenario[0].parameters; // { incomeDrop: 0.5, expensesRise: 0.2 }

            const adjustedIncome = (user[0].monthlyIncome || 0) * (1 - (params.incomeDrop || 0));
            const adjustedBurn = avgMonthlyBurn * (1 + (params.expensesRise || 0));

            const netMonthlyFlow = adjustedIncome - adjustedBurn;

            let runwayDays = 0;
            let criticalPoint = null;

            if (netMonthlyFlow >= 0) {
                runwayDays = 9999; // Infinite/Very long stable runway
            } else {
                // If net flow is negative, burn through liquidity
                const burnPerDay = Math.abs(netMonthlyFlow) / 30;
                runwayDays = Math.floor(totalLiquidity / burnPerDay);
                criticalPoint = new Date();
                criticalPoint.setDate(criticalPoint.getDate() + runwayDays);
            }

            const recommendations = this.generateRecommendations(params, runwayDays);

            await db.update(stressScenarios)
                .set({
                    survivalRunwayDays: runwayDays,
                    criticalFailurePoint: criticalPoint,
                    recommendations: recommendations,
                    updatedAt: new Date()
                })
                .where(eq(stressScenarios.id, scenarioId));

            return {
                runwayDays,
                criticalPoint,
                totalLiquidity,
                netMonthlyFlow,
                recommendations
            };
        } catch (error) {
            logError(`Stress simulation failed:`, error);
            throw error;
        }
    }

    async calculateTotalLiquidity(userId) {
        const vaultBalances = await db.execute(sql`
            SELECT SUM(balance) as total FROM vault_balances WHERE user_id = ${userId}
        `);
        return parseFloat(vaultBalances[0]?.total || 0);
    }

    async calculateMonthlyBurnRate(userId) {
        // Average expenses of last 3 months
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const stats = await db.select({
            total: sql`SUM(${expenses.amount})`
        })
            .from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                sql`${expenses.date} >= ${ninetyDaysAgo}`
            ));

        const totalSpent = parseFloat(stats[0]?.total || 0);
        return totalSpent / 3;
    }

    generateRecommendations(params, runwayDays) {
        const recs = [];
        if (runwayDays < 30) {
            recs.push("CRITICAL: Your liquidity lasts less than 30 days. Liquidation of non-cash assets recommended.");
        } else if (runwayDays < 90) {
            recs.push("WARNING: Runway is under 3 months. Cut discretionary spending immediately.");
        }

        if (params.incomeDrop > 0.3) {
            recs.push("Diversification: Your high dependency on a single income source is a risk. Explore side-income streams.");
        }

        if (params.marketDrop > 0.2) {
            recs.push("Portfolio Shield: Recommended hedging with stable-coins or treasury bonds to offset market volatility.");
        }

        return recs;
    }
}

export default new StressSimulator();
