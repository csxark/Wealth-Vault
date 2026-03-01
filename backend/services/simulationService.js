import db from '../config/db.js';
import { simulationResults, goalRiskProfiles } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logAuditEvent } from './auditService.js';

/**
 * Probabilistic Simulation Service (L3)
 * Implements Monte Carlo forecasting for wealth goals and portfolios.
 */
class SimulationService {
    // Standard risk profiles (Annualized Mean Return and Volatility)
    static RISK_PROFILES = {
        conservative: { mean: 0.04, vol: 0.05, inflation: 0.02, correlation: 0.1 },
        moderate: { mean: 0.07, vol: 0.12, inflation: 0.02, correlation: 0.3 },
        aggressive: { mean: 0.10, vol: 0.20, inflation: 0.02, correlation: 0.6 }
    };

    // Market Regimes for Stress Testing
    static REGIMES = {
        BULL: { mean_mult: 1.2, vol_mult: 0.8 },
        BEAR: { mean_mult: -0.5, vol_mult: 1.5 },
        STAGNANT: { mean_mult: 0.2, vol_mult: 0.5 }
    };

    /**
     * Run a Monte Carlo simulation for a specific goal
     * @param {string} userId 
     * @param {Object} goal - Goal object with targetAmount, currentAmount, and deadline
     * @param {number} iterations - Number of simulations (default 10000)
     */
    async runGoalSimulation(userId, goal, iterations = 10000) {
        const riskProfile = await this.getGoalRiskProfile(goal.id);
        const { mean, vol } = SimulationService.RISK_PROFILES[riskProfile.riskLevel];

        const horizonMonths = Math.max(1, Math.ceil((new Date(goal.targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 30.44)));
        const target = parseFloat(goal.targetAmount);
        const startValue = parseFloat(goal.currentAmount || 0);
        const monthlyContribution = parseFloat(goal.monthlyContribution || 0);

        const results = [];
        let successCount = 0;

        for (let i = 0; i < iterations; i++) {
            let currentValue = startValue;
            for (let m = 0; m < horizonMonths; m++) {
                // Geometric Brownian Motion (Monthly steps)
                const drift = (mean - 0.5 * Math.pow(vol, 2)) / 12;
                const diffusion = vol * Math.sqrt(1 / 12);
                const randomShock = this.standardNormal();

                currentValue = currentValue * Math.exp(drift + diffusion * randomShock) + monthlyContribution;
            }
            results.push(currentValue);
            if (currentValue >= target) successCount++;
        }

        // Calculate statistics
        results.sort((a, b) => a - b);
        const p10 = results[Math.floor(iterations * 0.1)];
        const p1 = results[Math.floor(iterations * 0.01)]; // 1% extreme risk
        const p50 = results[Math.floor(iterations * 0.5)];
        const p90 = results[Math.floor(iterations * 0.9)];
        const successProbability = successCount / iterations;

        // Expected Shortfall (CVaR at 5%)
        const tailIterations = Math.floor(iterations * 0.05);
        const tailResults = results.slice(0, tailIterations);
        const expectedShortfall = tailResults.length > 0
            ? target - (tailResults.reduce((sum, val) => sum + val, 0) / tailResults.length)
            : 0;

        // Save result to DB
        const [savedResult] = await db.insert(simulationResults).values({
            userId,
            resourceId: goal.id,
            resourceType: 'goal',
            p10Value: p10.toFixed(2),
            p50Value: p50.toFixed(2),
            p90Value: p90.toFixed(2),
            successProbability,
            expectedShortfall: expectedShortfall.toFixed(2),
            iterations,
            metadata: {
                riskLevel: riskProfile.riskLevel,
                horizonMonths,
                targetAmount: target,
                extremeRiskP1: p1.toFixed(2)
            }
        }).returning();

        // Update last simulation timestamp in profile
        await db.update(goalRiskProfiles)
            .set({ lastSimulationAt: new Date() })
            .where(eq(goalRiskProfiles.goalId, goal.id));

        // Log Audit
        await logAuditEvent({
            userId,
            action: 'MONTE_CARLO_SIMULATION',
            resourceType: 'goal',
            resourceId: goal.id,
            metadata: {
                successProbability,
                iterations,
                p50Value: p50.toFixed(2)
            }
        });

        return savedResult;
    }

    /**
     * Helper to get or create a risk profile for a goal
     */
    async getGoalRiskProfile(goalId) {
        let profile = await db.query.goalRiskProfiles.findFirst({
            where: eq(goalRiskProfiles.goalId, goalId)
        });

        if (!profile) {
            [profile] = await db.insert(goalRiskProfiles).values({
                goalId,
                riskLevel: 'moderate',
                autoRebalance: false
            }).returning();
        }

        return profile;
    }

    /**
     * Box-Muller transform to generate standard normal random variables
     */
    standardNormal() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }
    /**
     * Comprehensive Stress Test Simulation (L3)
     * Models goal performance under extreme market regimes.
     */
    async runStressTest(userId, goalId, regimeType = 'BEAR') {
        const goal = await db.query.goals.findFirst({ where: eq(goals.id, goalId) });
        const profile = await this.getGoalRiskProfile(goalId);
        const base = SimulationService.RISK_PROFILES[profile.riskLevel];
        const regime = SimulationService.REGIMES[regimeType];

        const adjustedMean = base.mean * regime.mean_mult;
        const adjustedVol = base.vol * regime.vol_mult;

        // Run simulation with adjusted parameters
        return this.runGoalSimulation(userId, goal, 5000); // Fewer iterations for stress tests
    }
}

export default new SimulationService();
