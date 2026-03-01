import cron from 'node-cron';
import db from '../config/db.js';
import { vaults, mortalityAssumptions, monteCarloRuns } from '../db/schema.js';
import monteCarloEngine from '../services/monteCarloEngine.js';
import longevityRiskAssessor from '../services/longevityRiskAssessor.js';
import estateTaxCalculator from '../services/estateTaxCalculator.js';
import distributionCurveService from '../services/distributionCurveService.js';
import { eq } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * WealthSimulationJob (#480)
 * Scans all users over night, executes 10,000 stochastic trajectories per user,
 * computes longevity risks and estate-tax breach thresholds.
 */
class WealthSimulationJob {
    start() {
        // Run daily at 1:30 AM
        cron.schedule('30 1 * * *', async () => {
            await this.executeGlobalForecasting();
        });
        logInfo('WealthSimulationJob scheduled (daily at 1:30 AM)');
    }

    async executeGlobalForecasting() {
        logInfo('📊 Starting Probabilistic Monte Carlo Longevity Forecaster for all users...');

        try {
            const users = await db.selectDistinct({ userId: vaults.ownerId }).from(vaults);

            // Execute in batches for memory stability
            for (const { userId } of users) {
                // Determine user defaults (would pull from actual settings/mortality)
                let currentAge = 60;
                let healthMultiplier = 1.0;
                let annualSpending = 120000; // Flat assumption
                let equityRatio = 0.60;

                // Override defaults if user explicitly set mortality assumptions
                const userAssumptions = await db.select().from(mortalityAssumptions).where(eq(mortalityAssumptions.userId, userId));
                if (userAssumptions.length > 0) {
                    currentAge = userAssumptions[0].currentAge;
                    healthMultiplier = parseFloat(userAssumptions[0].healthMultiplier);
                }

                // Get aggregated current wealth to seed the GBM path
                const startingWealth = await monteCarloEngine.getUserTotalWealth(userId);

                // Run 10k simulations across 40 years trajectory
                const trajectories = monteCarloEngine.runSimulations(startingWealth, 40, annualSpending, equityRatio);

                // Analyze 10k paths against mortality tables
                const riskAssessment = longevityRiskAssessor.evaluateRisk(trajectories, currentAge, healthMultiplier);

                // Extract median and tail ends (Distribution curves)
                const percentiles = distributionCurveService.extractPercentiles(trajectories);

                // Evaluate median impact on Estate Tax Brackets
                const expectedDeathYearOffset = riskAssessment.expectedDeathAge - currentAge;
                const estateTaxEvaluation = await estateTaxCalculator.calculateBreachProbability(
                    userId,
                    percentiles,
                    Math.max(0, expectedDeathYearOffset)
                );

                // Commit the mega-simulation back for API consumption
                await db.insert(monteCarloRuns).values({
                    userId,
                    simulationParams: {
                        initialWealth: startingWealth,
                        annualSpending,
                        equityRatio,
                        currentAge,
                        expectedDeathAge: riskAssessment.expectedDeathAge
                    },
                    longevityRiskScore: riskAssessment.longevityRiskScore.toString(),
                    estateTaxBreachYear: estateTaxEvaluation.breachYear,
                    successRate: riskAssessment.successRate.toString(),
                    percentiles: percentiles
                });
            }

            logInfo('✅ Probabilistic Monte Carlo Longevity Forecaster completed successfully.');
        } catch (err) {
            logError('WealthSimulationJob failed execution:', err);
        }
    }
}

export default new WealthSimulationJob();
