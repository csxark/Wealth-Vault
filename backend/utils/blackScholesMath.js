/**
 * Black-Scholes-Merton Options Pricing Model (#509)
 * Used to calculate theoretical prices (premiums) for European-style calls and puts.
 * For American-style (common in US stocks), this provides a sufficiently close 
 * baseline for zero-cost collar calculations.
 */

// Math helpers for cumulative normal distribution (CND)
function cnd(x) {
    const a1 = 0.31938153;
    const a2 = -0.356563782;
    const a3 = 1.781477937;
    const a4 = -1.821255978;
    const a5 = 1.330274429;
    const L = Math.abs(x);
    const K = 1.0 / (1.0 + 0.2316419 * L);
    let d = 1.0 - 1.0 / Math.sqrt(2 * Math.PI) * Math.exp(-L * L / 2) * (a1 * K + a2 * K * K + a3 * Math.pow(K, 3) + a4 * Math.pow(K, 4) + a5 * Math.pow(K, 5));

    if (x < 0) {
        return 1.0 - d;
    }
    return d;
}

/**
 * Calculates Black-Scholes Option Price.
 * @param {string} type - 'call' or 'put'
 * @param {number} S - Current stock price
 * @param {number} K - Strike price
 * @param {number} T - Time to expiration (in years, e.g. 30/365)
 * @param {number} r - Risk-free interest rate (decimal, e.g. 0.05)
 * @param {number} v - Implied Volatility (decimal, e.g. 0.25)
 */
export function calculateBlackScholes(type, S, K, T, r, v) {
    if (T <= 0) return Math.max(0, type === 'call' ? S - K : K - S);

    const d1 = (Math.log(S / K) + (r + (v * v) / 2) * T) / (v * Math.sqrt(T));
    const d2 = d1 - v * Math.sqrt(T);

    if (type === 'call') {
        const price = S * cnd(d1) - K * Math.exp(-r * T) * cnd(d2);
        const delta = cnd(d1);
        return { price, delta };
    } else {
        const price = K * Math.exp(-r * T) * cnd(-d2) - S * cnd(-d1);
        const delta = cnd(d1) - 1;
        return { price, delta };
    }
}

/**
 * Solves for Implied Volatility (IV) using Newton-Raphson.
 * Used when we know the market price and want to find the market's vol assumption.
 */
export function calculateImpliedVol(targetPrice, type, S, K, T, r) {
    let vol = 0.5; // Initial guess
    const maxIterations = 100;
    const precision = 0.0001;

    for (let i = 0; i < maxIterations; i++) {
        const { price } = calculateBlackScholes(type, S, K, T, r, vol);
        const diff = targetPrice - price;

        if (Math.abs(diff) < precision) return vol;

        // Vega (derivative of price with respect to vol)
        const d1 = (Math.log(S / K) + (r + (vol * vol) / 2) * T) / (vol * Math.sqrt(T));
        const vega = S * Math.sqrt(T) * (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-d1 * d1 / 2);

        if (vega < 0.0001) break; // Avoid division by zero

        vol = vol + diff / vega;
    }

    return vol;
}
