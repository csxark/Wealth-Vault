/**
 * Monte Carlo Simulation Engine (#454)
 * Implements Geometric Brownian Motion (GBM) for probabilistic financial forecasting.
 */

/**
 * Generate a single path for an asset's value over time.
 * @param {number} startValue - Initial value of the asset.
 * @param {number} drift - Annualized return (e.g., 0.07 for 7%).
 * @param {number} volatility - Annualized standard deviation (e.g., 0.15 for 15%).
 * @param {number} years - Time horizon.
 * @param {number} stepsPerYear - Frequency of calculation (e.g., 12 for monthly).
 * @returns {Array} List of values over time.
 */
export const generateGBMPath = (startValue, drift, volatility, years, stepsPerYear = 12) => {
    const dt = 1 / stepsPerYear;
    const totalSteps = Math.floor(years * stepsPerYear);
    const path = [startValue];

    let currentValue = startValue;

    for (let i = 0; i < totalSteps; i++) {
        // Standard normal random variable (Box-Muller transform)
        const u1 = Math.random();
        const u2 = Math.random();
        const randNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

        // GBM formula: S(t+dt) = S(t) * exp((drift - 0.5 * vol^2) * dt + vol * sqrt(dt) * randNormal)
        const exponent = (drift - 0.5 * Math.pow(volatility, 2)) * dt + volatility * Math.sqrt(dt) * randNormal;
        currentValue = currentValue * Math.exp(exponent);

        path.push(currentValue);
    }

    return path;
};

/**
 * Run a full Monte Carlo simulation with multiple iterations.
 * @param {number} startValue 
 * @param {number} drift 
 * @param {number} volatility 
 * @param {number} years 
 * @param {number} iterations - Number of paths to simulate.
 */
export const runMonteCarloSimulation = (startValue, drift, volatility, years, iterations = 1000) => {
    const allPathsFinalValues = [];
    const samplePaths = []; // Store a few paths for visualization

    for (let i = 0; i < iterations; i++) {
        const path = generateGBMPath(startValue, drift, volatility, years);
        allPathsFinalValues.push(path[path.length - 1]);

        // Save first 10 paths as samples
        if (i < 10) {
            samplePaths.push(path);
        }
    }

    // Calculate percentiles
    allPathsFinalValues.sort((a, b) => a - b);

    const p10 = allPathsFinalValues[Math.floor(iterations * 0.1)];
    const p50 = allPathsFinalValues[Math.floor(iterations * 0.5)];
    const p90 = allPathsFinalValues[Math.floor(iterations * 0.9)];
    const successRate = (allPathsFinalValues.filter(v => v >= startValue).length / iterations) * 100;

    return {
        p10,
        p50,
        p90,
        successRate,
        samplePaths
    };
};

/**
 * Butterfly Effect Calculator:Opportunity Cost of Daily Habits
 * @param {number} dailyAmount - e.g. $5 for coffee
 * @param {number} drift - Annual return expectation
 * @param {number} volatility - Risk level
 * @param {number} years - Horizon
 */
export const calculateButterflyImpact = (dailyAmount, drift, volatility, years) => {
    const annualAmount = dailyAmount * 365;
    const paths = [];
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
        let totalPrincipal = 0;
        let totalInvested = 0;

        for (let y = 0; y < years; y++) {
            // Invest at start of year, then grow
            totalInvested += annualAmount;
            totalPrincipal += annualAmount;

            // GBM growth for the year
            const yearPath = generateGBMPath(totalPrincipal, drift, volatility, 1);
            totalPrincipal = yearPath[yearPath.length - 1];
        }
        paths.push(totalPrincipal);
    }

    paths.sort((a, b) => a - b);
    return {
        medianLostOpportunity: paths[Math.floor(iterations * 0.5)],
        totalInvested: annualAmount * years
    };
};
