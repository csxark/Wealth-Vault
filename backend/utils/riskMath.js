/**
 * Risk Math Utilities (#447)
 * Implements Value-at-Risk (VaR) and Conditional Drawdown formulas.
 */

/**
 * Calculate Value-at-Risk (VaR)
 * Estimates the maximum potential loss over a given time horizon at a specific confidence level.
 * @param {number} portfolioValue - Current total market value
 * @param {number} volatility - Standard deviation of returns (annualized)
 * @param {number} confidenceLevel - e.g., 0.95 or 0.99
 * @param {number} timeHorizonDays - e.g., 1 day or 30 days
 */
export const calculateVaR = (portfolioValue, volatility, confidenceLevel = 0.95, timeHorizonDays = 1) => {
    // Z-score for common confidence levels
    const zScores = {
        0.90: 1.28,
        0.95: 1.645,
        0.99: 2.33
    };

    const z = zScores[confidenceLevel] || 1.645;
    const dailyVolatility = volatility / Math.sqrt(252);
    const horizonVolatility = dailyVolatility * Math.sqrt(timeHorizonDays);

    const varAmount = portfolioValue * z * horizonVolatility;
    return parseFloat(varAmount.toFixed(2));
};

/**
 * Calculate Expected Shortfall (Conditional VaR)
 * Estimates the average loss in the tail beyond the VaR threshold.
 */
export const calculateExpectedShortfall = (portfolioValue, volatility, confidenceLevel = 0.95) => {
    const varAmount = calculateVaR(portfolioValue, volatility, confidenceLevel);
    // Rough estimate for normal distribution: ES is roughly 1.15-1.25x VaR for high confidence
    const esAmount = varAmount * 1.25;
    return parseFloat(esAmount.toFixed(2));
};

/**
 * Calculate Conditional Drawdown at Risk (CDaR)
 * Measures the average of drawdowns that exceed a certain threshold.
 */
export const calculateCDaR = (drawdowns, percentile = 0.95) => {
    if (drawdowns.length === 0) return 0;

    const sortedDrawdowns = [...drawdowns].sort((a, b) => b - a); // Descending
    const thresholdIndex = Math.floor(drawdowns.length * (1 - percentile));
    const tailDrawdowns = sortedDrawdowns.slice(0, Math.max(1, thresholdIndex));

    const avgDrawdown = tailDrawdowns.reduce((a, b) => a + b, 0) / tailDrawdowns.length;
    return parseFloat(avgDrawdown.toFixed(4));
};

/**
 * Calculate Liquidity Stress Factor
 * @param {number} cashRatio - Cash / Total Assets
 * @param {number} concentrationScore - 0 (diversified) to 1 (single asset)
 */
export const calculateStressFactor = (cashRatio, concentrationScore) => {
    // Higher score means higher risk of illiquidity during stress
    const factor = (1 - cashRatio) * (1 + concentrationScore);
    return parseFloat(Math.min(factor, 5).toFixed(2));
};
