/**
 * Financial Math Utilities (L3)
 * Standardizing complex amortization, NPV, and IRR formulas.
 */

/**
 * Calculate Monthly Payment for an Amortized Loan
 * M = P [ i(1 + i)^n ] / [ (1 + i)^n – 1]
 */
export const calculateAmortization = (principal, annualRate, months) => {
    const monthlyRate = annualRate / 12 / 100;
    if (monthlyRate === 0) return principal / months;
    return (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
};

/**
 * Calculate Net Present Value (NPV)
 */
export const calculateNPV = (rate, cashFlows) => {
    const r = rate / 100;
    return cashFlows.reduce((acc, val, i) => acc + val / Math.pow(1 + r, i), 0);
};

/**
 * Calculate Internal Rate of Return (IRR) - Simplistic Newton-Raphson
 */
export const calculateIRR = (cashFlows, estimate = 0.1) => {
    let x = estimate;
    for (let i = 0; i < 20; i++) {
        let f = 0;
        let df = 0;
        for (let j = 0; j < cashFlows.length; j++) {
            f += cashFlows[j] / Math.pow(1 + x, j);
            df -= j * cashFlows[j] / Math.pow(1 + x, j + 1);
        }
        x = x - f / df;
    }
    return x * 100;
};

/**
 * Calculate Break-Even Months for Refinancing
 */
export const calculateBreakEven = (monthlySaving, closingCosts) => {
    if (monthlySaving <= 0) return Infinity;
    return Math.ceil(closingCosts / monthlySaving);
};

/**
 * Calculate Remaining Balance on Amortized Loan
 */
export const calculateRemainingBalance = (principal, annualRate, totalMonths, passedMonths) => {
    const r = annualRate / 12 / 100;
    if (r === 0) return principal * (1 - passedMonths / totalMonths);
    const n = totalMonths;
    const p = passedMonths;
    return principal * (Math.pow(1 + r, n) - Math.pow(1 + r, p)) / (Math.pow(1 + r, n) - 1);
};
