/**
 * Statistical Math Lib (L3)
 * Implementation of Z-score and Moving Average volatility detection algorithms.
 */

/**
 * Calculate Moving Average
 */
export const calculateMovingAverage = (data, period) => {
    if (data.length < period) return null;
    const subset = data.slice(data.length - period);
    const sum = subset.reduce((a, b) => a + b, 0);
    return sum / period;
};

/**
 * Calculate Standard Deviation
 */
export const calculateStandardDeviation = (data) => {
    if (data.length === 0) return 0;
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
};

/**
 * Calculate Z-Score
 * (X - Mean) / StdDev
 */
export const calculateZScore = (value, mean, stdDev) => {
    if (stdDev === 0) return 0;
    return (value - mean) / stdDev;
};

/**
 * Detect Outliers using Z-Score
 * Typically Z > 3 or Z < -3 is a "Black Swan" event
 */
export const isAnomaly = (value, history, threshold = 3) => {
    if (history.length < 10) return false; // Need minimum history

    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const stdDev = calculateStandardDeviation(history);
    const zScore = calculateZScore(value, mean, stdDev);

    return Math.abs(zScore) > threshold;
};

/**
 * Calculate Relative Strength Index (RSI)
 * A momentum indicator that measures the magnitude of recent price changes 
 */
export const calculateRSI = (data, period = 14) => {
    if (data.length <= period) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = data.length - period; i < data.length; i++) {
        const diff = data[i] - data[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }

    if (losses === 0) return 100;
    const rs = (gains / period) / (losses / period);
    return 100 - (100 / (1 + rs));
};
