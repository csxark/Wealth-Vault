/**
 * IRR Utility for SPV Performance Tracking (#510)
 * Uses Newton-Raphson to solve for the Internal Rate of Return.
 */

const MAX_ITERATIONS = 100;
const PRECISION = 0.00001;

/**
 * Calculates Net Present Value at a given rate.
 * @param {number} rate - The discount rate (decimal).
 * @param {Array<Object>} cashFlows - List of { amount, daysFromStart }.
 */
export const calculateNPV = (rate, cashFlows) => {
    return cashFlows.reduce((acc, cf) => {
        // PV = Amount / (1 + r)^(t/365)
        const pv = cf.amount / Math.pow(1 + rate, cf.daysFromStart / 365);
        return acc + pv;
    }, 0);
};

/**
 * Derivative of NPV with respect to rate.
 */
const calculateNPVDerivative = (rate, cashFlows) => {
    return cashFlows.reduce((acc, cf) => {
        const t = cf.daysFromStart / 365;
        // dPV/dr = -t * Amount / (1 + r)^(t+1)
        const dPV = -t * cf.amount / Math.pow(1 + rate, t + 1);
        return acc + dPV;
    }, 0);
};

/**
 * Internal Rate of Return (IRR) 
 * @param {Array<Object>} cashFlows - Array of { amount, date }
 * @returns {number} IRR as a decimal.
 */
export const calculateIRR = (cashFlows) => {
    if (cashFlows.length < 2) return 0;

    // Sort by date to get the start date
    const sortedFlows = [...cashFlows].sort((a, b) => new Date(a.date) - new Date(b.date));
    const startDate = new Date(sortedFlows[0].date);

    // Map to normalized { amount, daysFromStart }
    const normalizedFlows = sortedFlows.map(cf => ({
        amount: parseFloat(cf.amount),
        daysFromStart: (new Date(cf.date) - startDate) / (1000 * 60 * 60 * 24)
    }));

    // Initial guess (10%)
    let rate = 0.1;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const npv = calculateNPV(rate, normalizedFlows);
        const derivative = calculateNPVDerivative(rate, normalizedFlows);

        if (Math.abs(derivative) < PRECISION) break;

        const nextRate = rate - (npv / derivative);

        if (Math.abs(nextRate - rate) < PRECISION) return nextRate;
        rate = nextRate;
    }

    return rate;
};

/**
 * Multiple on Invested Capital (MOIC)
 */
export const calculateMOIC = (cashFlows) => {
    const invested = cashFlows.filter(cf => cf.amount < 0).reduce((sum, cf) => sum + Math.abs(cf.amount), 0);
    const returned = cashFlows.filter(cf => cf.amount > 0).reduce((sum, cf) => sum + cf.amount, 0);

    return invested === 0 ? 0 : returned / invested;
};
