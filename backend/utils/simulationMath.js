/**
 * Simulation Core Math (L3)
 * Standardized logic for compound growth, statistical variance, and time-series extrapolation.
 */

/**
 * Normal Distribution Generator (Box-Muller transform)
 */
export const boxMullerRandom = (mean = 0, stdDev = 1) => {
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdDev + mean;
};

/**
 * Monte Carlo Simulation Step
 * Calculates future value with random variance (volatility)
 */
export const simulateStep = (currentValue, drift, volatility, timeStep = 1) => {
    // Basic Geometric Brownian Motion: dS = S * (mu*dt + sigma*epsilon*sqrt(dt))
    const epsilon = boxMullerRandom();
    const change = (drift * timeStep) + (volatility * epsilon * Math.sqrt(timeStep));
    return currentValue * (1 + change);
};

/**
 * Calculate Confidence Interval
 * Returns [low, high] based on standard deviations
 */
export const calculateConfidenceInterval = (samples, confidenceLevel = 0.95) => {
    if (!samples.length) return [0, 0];

    // Sort samples for percentile method
    const sorted = [...samples].sort((a, b) => a - b);
    const lowerIdx = Math.floor(samples.length * ((1 - confidenceLevel) / 2));
    const upperIdx = Math.floor(samples.length * (1 - (1 - confidenceLevel) / 2));

    return [
        sorted[lowerIdx] || sorted[0],
        sorted[upperIdx] || sorted[sorted.length - 1]
    ];
};

/**
 * Calculate Runway
 * How many time periods until balance <= 0
 */
export const calculateRunway = (balance, netBurnRate) => {
    if (netBurnRate <= 0) return Infinity; // Profitable or self-sustaining
    return balance / netBurnRate;
};

/**
 * Compound Growth Formula
 */
export const compoundGrowth = (principal, rate, periods) => {
    return principal * Math.pow(1 + rate, periods);
};
