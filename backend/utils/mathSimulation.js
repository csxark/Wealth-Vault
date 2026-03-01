/**
 * Mathematical Simulation Utilities
 * Statistical samplers and probability distribution functions for Monte Carlo simulations
 */

/**
 * Box-Muller transform for generating normally distributed random numbers
 * @param {number} mean - Mean of the distribution
 * @param {number} stdDev - Standard deviation
 * @returns {number} Random number from normal distribution
 */
export function normalRandom(mean = 0, stdDev = 1) {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    
    return mean + z0 * stdDev;
}

/**
 * Generate log-normally distributed random numbers
 * Used for modeling prices, revenues that can't go negative
 * @param {number} meanLog - Mean of underlying normal distribution
 * @param {number} stdDevLog - Std dev of underlying normal distribution
 * @returns {number} Random number from lognormal distribution
 */
export function lognormalRandom(meanLog = 0, stdDevLog = 1) {
    const normalValue = normalRandom(meanLog, stdDevLog);
    return Math.exp(normalValue);
}

/**
 * Generate uniformly distributed random number in range
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (exclusive)
 * @returns {number} Random number from uniform distribution
 */
export function uniformRandom(min = 0, max = 1) {
    return min + Math.random() * (max - min);
}

/**
 * Generate exponentially distributed random numbers
 * Used for modeling time between events, customer arrival rates
 * @param {number} lambda - Rate parameter (1/mean)
 * @returns {number} Random number from exponential distribution
 */
export function exponentialRandom(lambda = 1) {
    return -Math.log(1 - Math.random()) / lambda;
}

/**
 * Generate Poisson distributed random numbers
 * Used for modeling count data (number of transactions per day, etc.)
 * @param {number} lambda - Expected number of occurrences
 * @returns {number} Random integer from Poisson distribution
 */
export function poissonRandom(lambda) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    
    do {
        k++;
        p *= Math.random();
    } while (p > L);
    
    return k - 1;
}

/**
 * Generate gamma distributed random numbers
 * Used for modeling waiting times, insurance claims
 * @param {number} shape - Shape parameter (k)
 * @param {number} scale - Scale parameter (θ)
 * @returns {number} Random number from gamma distribution
 */
export function gammaRandom(shape, scale = 1) {
    // Marsaglia and Tsang method for shape >= 1
    if (shape >= 1) {
        const d = shape - 1/3;
        const c = 1 / Math.sqrt(9 * d);
        
        while (true) {
            let x, v;
            do {
                x = normalRandom(0, 1);
                v = 1 + c * x;
            } while (v <= 0);
            
            v = v * v * v;
            const u = Math.random();
            
            if (u < 1 - 0.0331 * x * x * x * x) {
                return d * v * scale;
            }
            
            if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
                return d * v * scale;
            }
        }
    } else {
        // For shape < 1, use transformation
        return gammaRandom(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
    }
}

/**
 * Generate beta distributed random numbers
 * Used for modeling probabilities, proportions
 * @param {number} alpha - First shape parameter
 * @param {number} beta - Second shape parameter
 * @returns {number} Random number from beta distribution (0, 1)
 */
export function betaRandom(alpha, beta) {
    const x = gammaRandom(alpha);
    const y = gammaRandom(beta);
    return x / (x + y);
}

/**
 * Generate triangular distributed random numbers
 * Used for modeling when you know min, max, and most likely value
 * @param {number} min - Minimum value
 * @param {number} mode - Most likely value (peak)
 * @param {number} max - Maximum value
 * @returns {number} Random number from triangular distribution
 */
export function triangularRandom(min, mode, max) {
    const u = Math.random();
    const f = (mode - min) / (max - min);
    
    if (u < f) {
        return min + Math.sqrt(u * (max - min) * (mode - min));
    } else {
        return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
}

/**
 * Bernoulli trial - returns true with given probability
 * @param {number} probability - Probability of success (0-1)
 * @returns {boolean} True with probability p, false otherwise
 */
export function bernoulliTrial(probability) {
    return Math.random() < probability;
}

/**
 * Generate geometric Brownian motion path
 * Used for modeling stock prices, asset values with drift and volatility
 * @param {number} S0 - Initial value
 * @param {number} mu - Drift (expected return)
 * @param {number} sigma - Volatility (std dev of returns)
 * @param {number} steps - Number of time steps
 * @param {number} dt - Time increment per step
 * @returns {number[]} Array of values representing the path
 */
export function geometricBrownianMotion(S0, mu, sigma, steps, dt = 1) {
    const path = [S0];
    let S = S0;
    
    for (let i = 0; i < steps; i++) {
        const dW = normalRandom(0, Math.sqrt(dt));
        const dS = mu * S * dt + sigma * S * dW;
        S = S + dS;
        path.push(Math.max(0, S)); // Prevent negative values
    }
    
    return path;
}

/**
 * Generate Ornstein-Uhlenbeck process path
 * Mean-reverting random walk, used for modeling interest rates, volatility
 * @param {number} X0 - Initial value
 * @param {number} theta - Mean reversion speed
 * @param {number} mu - Long-term mean
 * @param {number} sigma - Volatility
 * @param {number} steps - Number of time steps
 * @param {number} dt - Time increment per step
 * @returns {number[]} Array of values representing the path
 */
export function ornsteinUhlenbeckProcess(X0, theta, mu, sigma, steps, dt = 1) {
    const path = [X0];
    let X = X0;
    
    for (let i = 0; i < steps; i++) {
        const dW = normalRandom(0, Math.sqrt(dt));
        const dX = theta * (mu - X) * dt + sigma * dW;
        X = X + dX;
        path.push(X);
    }
    
    return path;
}

/**
 * Calculate percentile from sorted array
 * @param {number[]} sortedArray - Array sorted in ascending order
 * @param {number} percentile - Percentile (0-1, e.g., 0.5 for median)
 * @returns {number} Value at the given percentile
 */
export function percentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return null;
    if (percentile <= 0) return sortedArray[0];
    if (percentile >= 1) return sortedArray[sortedArray.length - 1];
    
    const index = (sortedArray.length - 1) * percentile;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    
    if (lower === upper) {
        return sortedArray[index];
    }
    
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

/**
 * Calculate mean of array
 * @param {number[]} array - Input array
 * @returns {number} Mean value
 */
export function mean(array) {
    if (array.length === 0) return 0;
    return array.reduce((sum, val) => sum + val, 0) / array.length;
}

/**
 * Calculate standard deviation of array
 * @param {number[]} array - Input array
 * @param {boolean} sample - If true, use sample std dev (N-1 denominator)
 * @returns {number} Standard deviation
 */
export function stdDev(array, sample = true) {
    if (array.length === 0) return 0;
    const avg = mean(array);
    const squareDiffs = array.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = mean(squareDiffs);
    const denominator = sample ? array.length - 1 : array.length;
    return Math.sqrt(avgSquareDiff * (array.length / denominator));
}

/**
 * Calculate variance of array
 * @param {number[]} array - Input array
 * @param {boolean} sample - If true, use sample variance (N-1 denominator)
 * @returns {number} Variance
 */
export function variance(array, sample = true) {
    const sd = stdDev(array, sample);
    return sd * sd;
}

/**
 * Calculate skewness (asymmetry) of distribution
 * @param {number[]} array - Input array
 * @returns {number} Skewness (0 = symmetric, >0 = right-skewed, <0 = left-skewed)
 */
export function skewness(array) {
    if (array.length === 0) return 0;
    const avg = mean(array);
    const sd = stdDev(array, false);
    if (sd === 0) return 0;
    
    const n = array.length;
    const m3 = array.reduce((sum, val) => sum + Math.pow((val - avg) / sd, 3), 0) / n;
    
    return m3;
}

/**
 * Calculate kurtosis (tail risk) of distribution
 * @param {number[]} array - Input array
 * @returns {number} Excess kurtosis (0 = normal, >0 = fat tails, <0 = thin tails)
 */
export function kurtosis(array) {
    if (array.length === 0) return 0;
    const avg = mean(array);
    const sd = stdDev(array, false);
    if (sd === 0) return 0;
    
    const n = array.length;
    const m4 = array.reduce((sum, val) => sum + Math.pow((val - avg) / sd, 4), 0) / n;
    
    return m4 - 3; // Excess kurtosis (subtract 3 to make normal distribution = 0)
}

/**
 * Calculate covariance between two arrays
 * @param {number[]} x - First array
 * @param {number[]} y - Second array
 * @returns {number} Covariance
 */
export function covariance(x, y) {
    if (x.length !== y.length || x.length === 0) return 0;
    
    const meanX = mean(x);
    const meanY = mean(y);
    
    let sum = 0;
    for (let i = 0; i < x.length; i++) {
        sum += (x[i] - meanX) * (y[i] - meanY);
    }
    
    return sum / (x.length - 1);
}

/**
 * Calculate Pearson correlation coefficient
 * @param {number[]} x - First array
 * @param {number[]} y - Second array
 * @returns {number} Correlation (-1 to 1)
 */
export function correlation(x, y) {
    const cov = covariance(x, y);
    const sdX = stdDev(x);
    const sdY = stdDev(y);
    
    if (sdX === 0 || sdY === 0) return 0;
    
    return cov / (sdX * sdY);
}

/**
 * Calculate Value at Risk (VaR)
 * @param {number[]} returns - Array of returns or losses
 * @param {number} confidenceLevel - Confidence level (e.g., 0.95 for 95% VaR)
 * @returns {number} VaR value
 */
export function valueAtRisk(returns, confidenceLevel = 0.95) {
    const sortedReturns = [...returns].sort((a, b) => a - b);
    return percentile(sortedReturns, 1 - confidenceLevel);
}

/**
 * Calculate Conditional Value at Risk (CVaR) / Expected Shortfall
 * Average loss beyond VaR
 * @param {number[]} returns - Array of returns or losses
 * @param {number} confidenceLevel - Confidence level (e.g., 0.95)
 * @returns {number} CVaR value
 */
export function conditionalVaR(returns, confidenceLevel = 0.95) {
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const varIndex = Math.floor((1 - confidenceLevel) * sortedReturns.length);
    
    const tailReturns = sortedReturns.slice(0, varIndex + 1);
    return mean(tailReturns);
}

/**
 * Calculate maximum drawdown
 * Largest peak-to-trough decline
 * @param {number[]} values - Array of cumulative values
 * @returns {object} {maxDrawdown, peak, trough}
 */
export function maxDrawdown(values) {
    let maxDD = 0;
    let peak = values[0];
    let peakIndex = 0;
    let troughIndex = 0;
    
    for (let i = 0; i < values.length; i++) {
        if (values[i] > peak) {
            peak = values[i];
            peakIndex = i;
        }
        
        const drawdown = (peak - values[i]) / peak;
        if (drawdown > maxDD) {
            maxDD = drawdown;
            troughIndex = i;
        }
    }
    
    return {
        maxDrawdown: maxDD,
        maxDrawdownAmount: peak - values[troughIndex],
        peak,
        trough: values[troughIndex],
        peakIndex,
        troughIndex
    };
}

/**
 * Create histogram bins from data
 * @param {number[]} data - Input data
 * @param {number} binCount - Number of bins (default: Sturges' rule)
 * @returns {object[]} Array of {binStart, binEnd, binMid, count, frequency}
 */
export function histogram(data, binCount = null) {
    if (data.length === 0) return [];
    
    // Use Sturges' rule if bin count not specified
    if (!binCount) {
        binCount = Math.ceil(Math.log2(data.length) + 1);
    }
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binWidth = (max - min) / binCount;
    
    const bins = Array(binCount).fill(0).map((_, i) => ({
        binStart: min + i * binWidth,
        binEnd: min + (i + 1) * binWidth,
        binMid: min + (i + 0.5) * binWidth,
        count: 0,
        frequency: 0
    }));
    
    // Count data points in each bin
    data.forEach(value => {
        let binIndex = Math.floor((value - min) / binWidth);
        if (binIndex >= binCount) binIndex = binCount - 1; // Handle max value
        if (binIndex < 0) binIndex = 0;
        bins[binIndex].count++;
    });
    
    // Calculate frequencies
    bins.forEach(bin => {
        bin.frequency = bin.count / data.length;
    });
    
    return bins;
}

/**
 * Generate correlated normal random numbers using Cholesky decomposition
 * @param {number[][]} correlationMatrix - Correlation matrix
 * @param {number[]} means - Array of means
 * @param {number[]} stdDevs - Array of standard deviations
 * @returns {number[]} Array of correlated random numbers
 */
export function correlatedNormals(correlationMatrix, means, stdDevs) {
    const n = means.length;
    
    // Generate independent standard normals
    const Z = Array(n).fill(0).map(() => normalRandom(0, 1));
    
    // Cholesky decomposition of correlation matrix (simplified for 2x2)
    if (n === 2) {
        const rho = correlationMatrix[0][1];
        const X = [
            Z[0],
            rho * Z[0] + Math.sqrt(1 - rho * rho) * Z[1]
        ];
        
        return X.map((x, i) => means[i] + x * stdDevs[i]);
    }
    
    // For larger matrices, would need full Cholesky implementation
    // For now, return uncorrelated normals
    return means.map((mean, i) => normalRandom(mean, stdDevs[i]));
}

/**
 * Seeded random number generator (Linear Congruential Generator)
 * For reproducible simulations
 * @param {number} seed - Seed value
 * @returns {function} Random number generator function (0-1)
 */
export function seededRandom(seed) {
    let currentSeed = seed;
    
    return function() {
        currentSeed = (currentSeed * 9301 + 49297) % 233280;
        return currentSeed / 233280;
    };
}

export default {
    normalRandom,
    lognormalRandom,
    uniformRandom,
    exponentialRandom,
    poissonRandom,
    gammaRandom,
    betaRandom,
    triangularRandom,
    bernoulliTrial,
    geometricBrownianMotion,
    ornsteinUhlenbeckProcess,
    percentile,
    mean,
    stdDev,
    variance,
    skewness,
    kurtosis,
    covariance,
    correlation,
    valueAtRisk,
    conditionalVaR,
    maxDrawdown,
    histogram,
    correlatedNormals,
    seededRandom
};
