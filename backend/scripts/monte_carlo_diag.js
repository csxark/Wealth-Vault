import monteCarloEngine from '../services/monteCarloEngine.js';
import longevityRiskAssessor from '../services/longevityRiskAssessor.js';
import estateTaxCalculator from '../services/estateTaxCalculator.js';
import distributionCurveService from '../services/distributionCurveService.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Monte Carlo Diagnostic Tool (#480)
 * Run with: node backend/scripts/monte_carlo_diag.js
 */
async function diagnostic() {
    logInfo('🚀 Starting Monte Carlo Forecaster Diagnostic...');

    try {
        const userId = '12345678-1234-1234-1234-123456789012'; // Mock ID
        const startingWealth = 15000000; // $15M
        const annualSpending = 500000;  // $500k/year
        const currentAge = 55;
        const years = 45; // Simulate until 100

        logInfo(`Step 1: Running 10,000 simulations for $${startingWealth / 1e6}M wealth...`);
        const trajectories = monteCarloEngine.runSimulations(startingWealth, years, annualSpending, 0.70);
        logInfo(`✅ Simulations complete. Paths count: ${trajectories.length}`);

        logInfo('Step 2: Evaluating Longevity Risk...');
        const risk = longevityRiskAssessor.evaluateRisk(trajectories, currentAge, 1.1); // Good health
        logInfo(`Success Rate: ${risk.successRate}%`);
        logInfo(`Risk Score: ${risk.longevityRiskScore}`);
        logInfo(`Expected Death Age: ${risk.expectedDeathAge}`);

        logInfo('Step 3: Extracting Percentiles...');
        const percentiles = distributionCurveService.extractPercentiles(trajectories);
        logInfo(`- Median Terminal Wealth: $${(percentiles.percentile50[years] / 1e6).toFixed(2)}M`);
        logInfo(`- 10th Percentile (Bust): $${(percentiles.percentile10[years] / 1e6).toFixed(2)}M`);
        logInfo(`- 90th Percentile (Boom): $${(percentiles.percentile90[years] / 1e6).toFixed(2)}M`);

        logInfo('Step 4: Checking Estate Tax Breach...');
        // Mock a $10M exemption
        const estateEvaluation = await estateTaxCalculator.calculateBreachProbability(
            userId,
            percentiles,
            risk.expectedDeathAge - currentAge
        );

        logInfo(`Breach Year: ${estateEvaluation.breachYear !== null ? `Year ${estateEvaluation.breachYear}` : 'Never'}`);
        logInfo(`Estimated Tax Burden at Death: $${(estateEvaluation.expectedTaxBurdenAtDeath / 1e6).toFixed(2)}M`);

        logInfo('🏆 DIAGNOSTIC SUCCESSFUL!');

    } catch (error) {
        logError('Diagnostic failed:', error);
    } finally {
        process.exit();
    }
}

diagnostic();
