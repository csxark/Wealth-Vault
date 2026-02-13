import replayEngine from './replayEngine.js';
import db from '../config/db.js';
import { replayScenarios, backtestResults } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Simulation Service - Handles "What-If" financial scenarios
 */
class SimulationService {
    /**
     * Run a financial simulation based on a scenario
     * @param {string} scenarioId - Scenario ID
     */
    async runSimulation(scenarioId) {
        try {
            const [scenario] = await db.select()
                .from(replayScenarios)
                .where(eq(replayScenarios.id, scenarioId));

            if (!scenario) throw new Error('Scenario not found');

            await db.update(replayScenarios)
                .set({ status: 'running' })
                .where(eq(replayScenarios.id, scenarioId));

            const { userId, startDate, endDate, whatIfChanges } = scenario;

            // 1. Get baseline state at start date
            const baseline = await replayEngine.replayToDate(userId, new Date(startDate));
            let simulatedState = JSON.parse(JSON.stringify(baseline.state));
            let actualState = JSON.parse(JSON.stringify(baseline.state));

            // 2. Perform the "time travel" replay
            const timelineData = [];
            const start = new Date(startDate);
            const end = new Date(endDate);

            // Iterate day by day or by event
            // For simplicity, we'll fetch all deltas in the range
            const deltas = await replayEngine.getDeltasInRange(userId, start, end);

            // Map deltas by date
            const deltasByDate = {};
            deltas.forEach(d => {
                const dateKey = new Date(d.createdAt).toISOString().split('T')[0];
                if (!deltasByDate[dateKey]) deltasByDate[dateKey] = [];
                deltasByDate[dateKey].push(d);
            });

            const currentDate = new Date(start);
            while (currentDate <= end) {
                const dateKey = currentDate.toISOString().split('T')[0];

                // Track actual changes
                const actualDeltas = deltasByDate[dateKey] || [];
                for (const delta of actualDeltas) {
                    actualState = replayEngine.applyDelta(actualState, delta);

                    // Apply to simulated state ONLY if it's not overridden by whatIfChanges
                    const isOverridden = whatIfChanges.some(change =>
                        change.operation === 'DELETE' && change.resourceId === delta.resourceId
                    );

                    if (!isOverridden) {
                        simulatedState = replayEngine.applyDelta(simulatedState, delta);
                    }
                }

                // Apply what-if changes scheduled for this date
                const scheduledChanges = whatIfChanges.filter(c => c.date === dateKey);
                for (const change of scheduledChanges) {
                    if (change.operation === 'INJECT_EXPENSE') {
                        simulatedState.expenses.push({
                            id: 'sim-' + Math.random().toString(36).substr(2, 9),
                            amount: change.amount,
                            description: change.description,
                            date: currentDate.toISOString(),
                            status: 'completed'
                        });
                    }
                }

                // Record daily net worth
                const actualNW = this.calculateNetWorth(actualState);
                const simulatedNW = this.calculateNetWorth(simulatedState);

                timelineData.push({
                    date: dateKey,
                    actualValue: actualNW,
                    simulatedValue: simulatedNW,
                    delta: simulatedNW - actualNW
                });

                currentDate.setDate(currentDate.getDate() + 1);
            }

            // 3. Save results
            const lastActualNW = timelineData[timelineData.length - 1].actualValue;
            const lastSimulatedNW = timelineData[timelineData.length - 1].simulatedValue;

            await db.insert(backtestResults).values({
                scenarioId,
                userId,
                actualNetWorth: lastActualNW.toString(),
                simulatedNetWorth: lastSimulatedNW.toString(),
                difference: (lastSimulatedNW - lastActualNW).toString(),
                differencePercent: lastActualNW !== 0 ? ((lastSimulatedNW - lastActualNW) / lastActualNW) * 100 : 0,
                timelineData,
                performanceMetrics: {
                    volatility: this.calculateVolatility(timelineData),
                    finalDiff: lastSimulatedNW - lastActualNW
                }
            });

            await db.update(replayScenarios)
                .set({ status: 'completed', completedAt: new Date() })
                .where(eq(replayScenarios.id, scenarioId));

            return { scenarioId, status: 'success' };
        } catch (error) {
            console.error('Simulation failed:', error);
            await db.update(replayScenarios)
                .set({ status: 'failed' })
                .where(eq(replayScenarios.id, scenarioId));
            throw error;
        }
    }

    calculateNetWorth(state) {
        const netExpenses = state.expenses
            ?.filter(e => e.status === 'completed')
            .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0) || 0;

        const investmentValue = state.investments?.reduce((sum, i) => sum + parseFloat(i.marketValue || 0), 0) || 0;
        const debtValue = state.debts?.reduce((sum, d) => sum + parseFloat(d.currentBalance || 0), 0) || 0;

        return investmentValue - netExpenses - debtValue;
    }

    calculateVolatility(timeline) {
        // Simple standard deviation of daily differences
        const deltas = timeline.map(t => t.delta);
        const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        const squareDiffs = deltas.map(d => Math.pow(d - mean, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
        return Math.sqrt(avgSquareDiff);
    }
}

export default new SimulationService();
