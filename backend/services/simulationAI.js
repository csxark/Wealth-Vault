import db from '../config/db.js';
import { simulationScenarios, simulationResults, investments, goals, expenses } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { runMonteCarloSimulation, calculateButterflyImpact } from '../utils/monteCarlo.js';
import macroFeedService from './macroFeedService.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Simulation AI Engine (#454)
 * Orchestrates Monte Carlo runs and the "Butterfly Effect" opportunity cost logic.
 */
class SimulationAI {
    /**
     * Run a comprehensive Monte Carlo simulation for a user's total wealth.
     */
    async runGlobalSimulation(userId, scenarioId = null) {
        logInfo(`[Simulation AI] Starting global Monte Carlo for user ${userId}`);

        try {
            // 1. Get User Assets (Starting Principal)
            const [assetTotal] = await db.select({
                total: sql`SUM(CAST(current_price AS NUMERIC) * CAST(quantity AS NUMERIC))`
            }).from(investments).where(eq(investments.userId, userId));

            const startValue = parseFloat(assetTotal?.total || 1000); // Min $1000 for simulation

            // 2. Load Scenario Params
            let scenario;
            if (scenarioId) {
                [scenario] = await db.select().from(simulationScenarios).where(eq(simulationScenarios.id, scenarioId));
            } else {
                [scenario] = await db.select().from(simulationScenarios).where(and(eq(simulationScenarios.userId, userId), eq(simulationScenarios.isDefault, true)));
            }

            // Defaults if no scenario found
            const drift = scenario ? parseFloat(scenario.baseYearlyGrowth) / 100 : 0.07;

            // 3. Inject Macro Volatility
            const marketVol = await macroFeedService.getLatestIndex('MarketVol');
            const vol = scenario ? parseFloat(scenario.marketVolatility) / 100 : parseFloat(marketVol.currentValue);

            const years = scenario?.timeHorizonYears || 30;
            const iterations = scenario?.iterationCount || 10000;

            // 4. Run Simulation
            const results = runMonteCarloSimulation(startValue, drift, vol, years, iterations);

            // 5. Store Results
            const [savedResult] = await db.insert(simulationResults).values({
                userId,
                scenarioId: scenario?.id,
                resourceType: 'butterfly',
                successProbability: results.successRate / 100,
                p10Value: results.p10.toString(),
                p50Value: results.p50.toString(),
                p90Value: results.p90.toString(),
                simulationData: {
                    samplePaths: results.samplePaths,
                    input_drift: drift,
                    input_vol: vol
                },
                iterations: iterations,
                simulatedOn: new Date()
            }).returning();

            return {
                resultId: savedResult.id,
                ...results
            };
        } catch (error) {
            logError('[Simulation AI] Global simulation failed:', error);
            throw error;
        }
    }

    /**
     * Evaluate the "Butterfly Effect" of an expense habit.
     */
    async evaluateHabitImpact(userId, habitName, dailyCost) {
        logInfo(`[Simulation AI] Evaluating habit impact: ${habitName} ($${dailyCost}/day)`);

        const marketVol = await macroFeedService.getLatestIndex('MarketVol');
        const drift = 0.07; // 7% average market return
        const vol = parseFloat(marketVol.currentValue);
        const years = 30;

        const impact = calculateButterflyImpact(dailyCost, drift, vol, years);

        return {
            habit: habitName,
            dailyCost,
            horizonYears: years,
            lostOpportunityP50: impact.medianLostOpportunity,
            totalInvested: impact.totalInvested,
            multiplier: (impact.medianLostOpportunity / impact.totalInvested).toFixed(2)
        };
    }
}

export default new SimulationAI();
