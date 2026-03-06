/**
 * Settlement Math Utilities (#455)
 * Algorithms for optimal "Triangular Arbitrage" and internal offset calculations.
 */

/**
 * Calculate the potential savings of internal offsetting vs market conversion
 * @param {number} amount - Amount being settled
 * @param {number} interbankRate - Current mid-market rate
 * @param {number} spreadMarkup - Typical market markup (e.g., 0.015 for 1.5%)
 */
export const calculateOffsetSavings = (amount, interbankRate, spreadMarkup = 0.015) => {
    const marketCost = amount * interbankRate * (1 + spreadMarkup);
    const internalCost = amount * interbankRate; // Zero spread for internal offset
    return parseFloat((marketCost - internalCost).toFixed(2));
};

/**
 * Detect Triangular Arbitrage Opportunities
 * Checks if a circular trade (A -> B -> C -> A) results in a profit.
 * @param {Object} ratesMap - { 'USD_EUR': 0.85, 'EUR_GBP': 0.88, 'GBP_USD': 1.33 }
 */
export const detectTriangularArbitrage = (ratesMap) => {
    const opportunities = [];
    const currencies = ['USD', 'EUR', 'GBP', 'INR', 'JPY'];

    for (const a of currencies) {
        for (const b of currencies) {
            if (a === b) continue;
            for (const c of currencies) {
                if (b === c || a === c) continue;

                const ab = parseFloat(ratesMap[`${a}_${b}`] || 0);
                const bc = parseFloat(ratesMap[`${b}_${c}`] || 0);
                const ca = parseFloat(ratesMap[`${c}_${a}`] || 0);

                if (ab && bc && ca) {
                    const finalAmount = 1 * ab * bc * ca;
                    if (finalAmount > 1.0005) { // 0.05% threshold
                        opportunities.push({
                            path: [a, b, c, a],
                            profit: (finalAmount - 1) * 100,
                            finalAmount
                        });
                    }
                }
            }
        }
    }

    return opportunities.sort((a, b) => b.profit - a.profit);
};

/**
 * Calculate the required rebalance amount to bring a pool back to threshold
 * @param {number} currentBalance 
 * @param {number} threshold 
 */
export const calculatePoolRebalanceNeed = (currentBalance, threshold) => {
    const diff = parseFloat(threshold) - parseFloat(currentBalance);
    return diff > 0 ? diff : 0;
};
