import db from '../config/db.js';
import { simulationResults, marketIndices } from '../db/schema.js';
import { eq } from 'drizzle-orm';

class SimulationEngine {
    /**
     * Run a Monte Carlo simulation for a user's portfolio
     */
    async runMonteCarlo(userId, config = {}) {
        const {
            initialBalance = 100000,
            monthlyContribution = 1000,
            timeHorizonYears = 20,
            iterations = 1000,
            volatilityOverride = null,
            returnOverride = null
        } = config;

        // Fetch market context for baseline volatility/returns if not overridden
        const indices = await db.query.marketIndices.findMany();
        const spy = indices.find(i => i.name === 'S&P500') || { avgAnnualReturn: '0.08', volatility: '0.15' };

        const annualReturn = returnOverride !== null ? returnOverride : parseFloat(spy.avgAnnualReturn);
        const annualVolatility = volatilityOverride !== null ? volatilityOverride : parseFloat(spy.volatility);

        const allResults = [];

        for (let i = 0; i < iterations; i++) {
            let balance = initialBalance;
            const yearlyBalances = [balance];

            for (let year = 1; year <= timeHorizonYears; year++) {
                // Geometric Brownian Motion simulation
                // balance_new = balance_old * exp((r - 0.5 * sigma^2) + sigma * epsilon)
                const drift = annualReturn - 0.5 * Math.pow(annualVolatility, 2);
                const randomShock = annualVolatility * this.generateNormalRandom();

                balance = balance * Math.exp(drift + randomShock);
                balance += (monthlyContribution * 12); // Add annual contribution

                yearlyBalances.push(Math.round(balance));
            }
            allResults.push(yearlyBalances);
        }

        // Calculate Percentiles
        const summary = this.calculatePercentiles(allResults, timeHorizonYears);

        // Save result
        const [saved] = await db.insert(simulationResults).values({
            userId,
            scenarioName: config.scenarioName || 'Default Simulation',
            configurations: config,
            results: summary
        }).returning();

        return saved;
    }

    /**
     * Calculate p10, p50, p90 results across iterations
     */
    calculatePercentiles(allResults, years) {
        const p10 = [];
        const p50 = [];
        const p90 = [];

        for (let year = 0; year <= years; year++) {
            const yearData = allResults.map(res => res[year]).sort((a, b) => a - b);

            p10.push(yearData[Math.floor(allResults.length * 0.1)]);
            p50.push(yearData[Math.floor(allResults.length * 0.5)]);
            p90.push(yearData[Math.floor(allResults.length * 0.9)]);
        }

        return { p10, p50, p90, totalIterations: allResults.length };
    }

    /**
     * Box-Muller transform for normal distribution
     */
    generateNormalRandom() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }
}

export default new SimulationEngine();
