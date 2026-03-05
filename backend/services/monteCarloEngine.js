import StochasticMath from '../utils/stochasticMath.js';
import db from '../config/db.js';
import { vaultBalances } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * MonteCarloEngine (#480)
 * Orchestrates 10,000 stochastic simulations (combining equities GBM and bonds Vasicek)
 * to project terminal wealth paths given specific withdrawal rates.
 */
class MonteCarloEngine {
    constructor() {
        this.SIMULATION_RUNS = 10000;

        // Base market assumptions (In real app, this pulls from macroDataSync.js)
        this.EQUITY_MU = 0.07; // 7% annualized expected return
        this.EQUITY_SIGMA = 0.15; // 15% historical volatility

        this.BOND_START_RATE = 0.04;
        this.BOND_SPEED = 0.1;
        this.BOND_LONG_MEAN = 0.05;
        this.BOND_SIGMA = 0.02;
    }

    /**
     * Executes parallel stochastic arrays for predicting wealth longevity
     * @param {number} currentWealth The starting capital
     * @param {number} yearsToSimulate E.g., 30 for retirement
     * @param {number} annualSpending Flat or inflation-adjusted withdrawal amount
     * @param {number} equityRatio 0.0 to 1.0 (e.g., 0.6 for 60/40 portfolio)
     * @returns {number[][]} Array of 10,000 paths containing yearly wealth
     */
    runSimulations(currentWealth, yearsToSimulate, annualSpending, equityRatio = 0.60) {
        logInfo(`[MonteCarloEngine] Booting ${this.SIMULATION_RUNS} paths for ${yearsToSimulate} years...`);
        const bondRatio = 1.0 - equityRatio;
        const allTrajectories = [];

        // Parallelize inside Node via typed arrays or traditional loops
        // For performance in JS engine, traditional inner hot loops are quite fast
        for (let run = 0; run < this.SIMULATION_RUNS; run++) {
            const equityStart = currentWealth * equityRatio;

            // GBM for stocks
            const equityPath = StochasticMath.generateGBMPath(
                equityStart,
                this.EQUITY_MU,
                this.EQUITY_SIGMA,
                yearsToSimulate
            );

            // Vasicek compounding for bonds
            // We start w/ nominal bond allocation and grow it by simulated vasicek rates
            const vasicekRates = StochasticMath.generateVasicekPath(
                this.BOND_START_RATE,
                this.BOND_SPEED,
                this.BOND_LONG_MEAN,
                this.BOND_SIGMA,
                yearsToSimulate
            );

            const combinedPath = [currentWealth];
            let currentEquity = equityStart;
            let currentBond = currentWealth * bondRatio;

            for (let year = 1; year <= yearsToSimulate; year++) {
                // Apply stochastic growth (array indexes: year 1 corresponds to index 1 of the paths)

                // For equity, we get the multiplier from the GBM path
                const equityGrowthMult = equityPath[year] / equityPath[year - 1];
                currentEquity = currentEquity * equityGrowthMult;

                // For bonds, we grow it by Vasicek instantaneous rate
                const bondYield = vasicekRates[year - 1];
                currentBond = currentBond * Math.exp(bondYield); // Continuous compounding approximation

                // Compute pre-spending total
                let totalWealth = currentEquity + currentBond;

                // Deduct annualized spending
                totalWealth -= annualSpending;

                if (totalWealth <= 0) {
                    // Insolvency reached
                    combinedPath.push(0);
                    // Fill remaining years with 0
                    for (let j = year + 1; j <= yearsToSimulate; j++) combinedPath.push(0);
                    break;
                }

                combinedPath.push(totalWealth);

                // Auto-Rebalance to target weights (tax free assumption here for simplicity)
                currentEquity = totalWealth * equityRatio;
                currentBond = totalWealth * bondRatio;
            }

            allTrajectories.push(combinedPath);
        }

        return allTrajectories;
    }

    /**
     * Helper to fetch a user's total network wealth from DB to seed the simulation
     */
    async getUserTotalWealth(userId) {
        const balances = await db.select().from(vaultBalances).where(eq(vaultBalances.userId, userId));
        return balances.reduce((sum, b) => sum + parseFloat(b.balance || 0), 0);
    }
}

export default new MonteCarloEngine();
