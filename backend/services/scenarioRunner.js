import db from '../config/db.js';
import { stressTestScenarios, vaults, cashFlowProjections, users } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { calculateRunway } from '../utils/simulationMath.js';
import { logInfo, logError } from '../utils/logger.js';
import projectionEngine from './projectionEngine.js';

/**
 * Scenario Simulation Service (L3)
 * Functionality to run parallel simulations for various economic shifts.
 * Automated "Runway" calculation (how many days until zero balance).
 */
class ScenarioRunner {
    /**
     * Run a specific stress test scenario
     */
    async runStressTest(userId, scenarioId) {
        try {
            const scenario = await db.query.stressTestScenarios.findFirst({
                where: and(eq(stressTestScenarios.id, scenarioId), eq(stressTestScenarios.userId, userId))
            });

            if (!scenario) throw new Error('Scenario not found');

            logInfo(`[Scenario Runner] Running stress test: ${scenario.scenarioName} for user ${userId}`);

            // 1. Get current state
            const userVaults = await db.query.vaults.findMany({
                where: and(eq(vaults.ownerId, userId), eq(vaults.status, 'active'))
            });
            const totalBalance = userVaults.reduce((sum, v) => sum + parseFloat(v.balance), 0);

            // 2. Adjust drift based on scenario magnitude
            const baseVelocity = await projectionEngine.calculateHistoricalVelocity(userId);
            let adjustedDrift = baseVelocity.drift;

            if (scenario.variableAffected === 'income') {
                // If magnitude is 0.50 (50% drop), we reduce drift significantly
                adjustedDrift = adjustedDrift * (1 - parseFloat(scenario.impactMagnitude));
            } else if (scenario.variableAffected === 'expense') {
                // Increase burn
                adjustedDrift = adjustedDrift - parseFloat(scenario.impactMagnitude);
            } else if (scenario.variableAffected === 'asset_value') {
                // Direct asset hit + slightly lower future growth
                adjustedDrift = adjustedDrift * 0.9;
            }

            // 3. Automated Runway Calculation
            // Runway = current balance adjusted by hit / monthly net burn
            let simulationBalance = totalBalance;
            if (scenario.variableAffected === 'asset_value') {
                simulationBalance = totalBalance * (1 - parseFloat(scenario.impactMagnitude));
            }

            const monthlyNetFlow = totalBalance * adjustedDrift;
            const monthlyBurn = monthlyNetFlow < 0 ? Math.abs(monthlyNetFlow) : 0;

            const runwayMonths = calculateRunway(simulationBalance, monthlyBurn);

            // 4. Crisis Pivot Simulation
            const pivotImpact = this.simulateCrisisPivot(runwayMonths);

            // 5. Return Simulation Result
            return {
                scenarioName: scenario.scenarioName,
                impactMagnitude: scenario.impactMagnitude,
                projectedHit: (totalBalance - simulationBalance).toFixed(2),
                currentRunwayMonths: runwayMonths === Infinity ? 'Infinite' : runwayMonths.toFixed(1),
                projectedSolvencyDate: runwayMonths === Infinity ? 'Secure' : this.calculateSolvencyDate(runwayMonths),
                riskLevel: this.evaluateRisk(runwayMonths),
                pivotBenefit: pivotImpact.benefitMonths,
                recommendations: this.generateRecommendations(scenario, runwayMonths)
            };
        } catch (error) {
            logError('[Scenario Runner] Stress test execution failed:', error);
            throw error;
        }
    }

    /**
     * Simulate "Crisis Pivot" (emergency expense reduction)
     */
    simulateCrisisPivot(currentRunway) {
        if (currentRunway === Infinity) return { benefitMonths: 0 };
        // Assume user can cut discretionary spending by 30% in a crisis
        const newRunway = currentRunway / 0.7;
        return { benefitMonths: (newRunway - currentRunway).toFixed(1) };
    }

    /**
     * Helper to evaluate risk level
     */
    evaluateRisk(runwayMonths) {
        if (runwayMonths > 24) return 'Low';
        if (runwayMonths > 12) return 'Moderate';
        if (runwayMonths > 6) return 'High';
        return 'Critical';
    }

    /**
     * Calculate Solvency Date
     */
    calculateSolvencyDate(months) {
        const date = new Date();
        date.setMonth(date.getMonth() + Math.floor(months));
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    /**
     * Generate actionable recommendations
     */
    generateRecommendations(scenario, runway) {
        if (runway > 12) return ['Maintain current allocation', 'Review scenario quarterly'];

        const recs = ['Reduce discretionary spending by 20% immediately'];
        if (scenario.variableAffected === 'income') {
            recs.push('Explore side-income opportunities to offset drift');
            recs.push('Consolidate high-interest debts to lower burn');
        }
        if (scenario.variableAffected === 'asset_value') {
            recs.push('Pivot 40% of volatile assets to stable-havens');
            recs.push('Avoid realizing losses unless liquidity is required');
        }
        if (runway < 6) {
            recs.push('IMMEDIATE: Set up liquidity-lock bypass for emergency funds');
            recs.push('Contact vault participants for shared expense coverage');
        }
        return recs;
    }

    /**
     * Seed default scenarios for new users
     */
    async seedScenarios(userId) {
        const defaults = [
            { scenarioName: 'Global Recession (30% Asset Hit)', impactMagnitude: '0.30', variableAffected: 'asset_value' },
            { scenarioName: 'Total Income Stop (Job Loss)', impactMagnitude: '1.00', variableAffected: 'income' },
            { scenarioName: 'Rent/Mortgage Hike (15% Expense Delta)', impactMagnitude: '0.15', variableAffected: 'expense' },
            { scenarioName: 'Black-Swan Volatility (2x Volatility)', impactMagnitude: '0.50', variableAffected: 'asset_value' }
        ];

        try {
            await db.insert(stressTestScenarios).values(
                defaults.map(d => ({ ...d, userId }))
            );
        } catch (e) {
            // Likely already seeded
        }
    }
}

export default new ScenarioRunner();
