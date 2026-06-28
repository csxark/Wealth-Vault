import db from '../config/db.js';
import { cashFlowProjections, stressTestScenarios, liquidityVelocityLogs } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import projectionEngine from './projectionEngine.js';
import scenarioRunner from './scenarioRunner.js';

/**
 * Liquidity Health Report Service (L3)
 * Generates comprehensive human-readable reports on insolvency risk and cash-flow health.
 */
class LiquidityReportService {
    /**
     * Generate a full health audit
     */
    async generateReport(userId) {
        // 1. Get Projection Data
        const projections = await projectionEngine.getForecastSummary(userId);

        // 2. Get Velocity Stats
        const velocityLogs = await db.query.liquidityVelocityLogs.findMany({
            where: eq(liquidityVelocityLogs.userId, userId),
            orderBy: [desc(liquidityVelocityLogs.measuredAt)],
            limit: 7
        });

        const avgWeeklyVelocity = velocityLogs.reduce((sum, l) => sum + parseFloat(l.weeklyVelocity), 0) / (velocityLogs.length || 1);

        // 3. Run default stress tests
        const scenarios = await db.query.stressTestScenarios.findMany({
            where: eq(stressTestScenarios.userId, userId),
            limit: 2
        });

        const stressResults = await Promise.all(scenarios.map(s => scenarioRunner.runStressTest(userId, s.id)));

        // 4. Synthesize Audit
        const latestProjection = projections[projections.length - 1];
        const sixMonthProjection = projections[5];

        return {
            generatedAt: new Date(),
            coreMetrics: {
                currentWeeklyVelocity: avgWeeklyVelocity.toFixed(2),
                projectedOneYearBalance: latestProjection?.projectedBalance || 'N/A',
                sixMonthConfidenceInterval: sixMonthProjection ?
                    `[${sixMonthProjection.confidenceLow} - ${sixMonthProjection.confidenceHigh}]` : 'N/A'
            },
            riskScore: this.calculateGlobalRiskScore(projections, stressResults),
            executiveSummary: this.formatExecutiveSummary(projections, avgWeeklyVelocity, stressResults),
            topThreats: stressResults.filter(r => r.riskLevel === 'High' || r.riskLevel === 'Critical'),
            strategicAdvise: this.generateStrategicAdvice(stressResults, avgWeeklyVelocity)
        };
    }

    calculateGlobalRiskScore(projections, stressResults) {
        let score = 0; // 0 (Safe) to 100 (Insolvent)

        if (!projections.length) return 50;

        // Factor 1: Projections (Weight 40%)
        const last = parseFloat(projections[projections.length - 1].projectedBalance);
        const low = parseFloat(projections[projections.length - 1].confidenceLow);

        if (low < 0) score += 40;
        else if (last < 0) score += 20;

        // Factor 2: Stress Tests (Weight 60%)
        const criticalCount = stressResults.filter(r => r.riskLevel === 'Critical').length;
        score += (criticalCount * 20);

        return Math.min(100, score);
    }

    formatExecutiveSummary(projections, velocity, stressResults) {
        const trend = velocity < 0 ? 'contraction' : 'expansion';
        const runway = stressResults[0]?.currentRunwayMonths || 'Unknown';

        return `Your liquidity is currently in a state of ${trend}. Based on 1,000 Monte Carlo simulations, your 12-month expected balance is ${projections[projections.length - 1]?.projectedBalance || 'calculating...'}. Under a 'Job Loss' scenario, your runway is approximately ${runway} months.`;
    }

    generateStrategicAdvice(stressResults, velocity) {
        const advice = [];
        if (velocity < 0) advice.push("Current burn rate is unsustainable. Recommend 10% reduction in fixed costs.");
        if (stressResults.some(r => r.riskLevel === 'Critical')) advice.push("High insolvency risk detected in stress scenarios. Prioritize 6-month cash reserve.");
        advice.push("Maintain 25% of group liquidity in highly liquid USD/Stablecoin havens.");
        return advice;
    }
}

export default new LiquidityReportService();
