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

/**
 * Normalize currency amount to base (usually USD)
 */
export const normalizeToBase = (amount, rate) => {
    return parseFloat(amount) * parseFloat(rate);
};

/**
 * Calculate FX Gains (Realized/Unrealized)  
 * Delta = Market Value - Cost Basis
 */
export const calculateFXGain = (localAmount, acquisitionRate, currentRate) => {
    const costBasis = parseFloat(localAmount) * parseFloat(acquisitionRate);
    const marketValue = parseFloat(localAmount) * parseFloat(currentRate);
    return marketValue - costBasis;
};

// ============================================================================
// DOUBLE-ENTRY LEDGER & FX REVALUATION UTILITIES
// ============================================================================

/**
 * Round number to specified precision
 */
export const roundToPrecision = (value, precision = 2) => {
    const multiplier = Math.pow(10, precision);
    return Math.round(value * multiplier) / multiplier;
};

/**
 * Convert amount using FX rate
 */
export const convertCurrency = (amount, fxRate, precision = 2) => {
    if (!amount || !fxRate || fxRate === 0) return 0;
    return roundToPrecision(amount * fxRate, precision);
};

/**
 * Calculate unrealized FX gain/loss
 */
export const calculateUnrealizedFxGainLoss = (originalAmount, currentFxRate, historicalFxRate) => {
    const currentValue = convertCurrency(originalAmount, currentFxRate);
    const historicalValue = convertCurrency(originalAmount, historicalFxRate);
    const unrealizedGainLoss = currentValue - historicalValue;

    return {
        originalAmount,
        currentValue,
        historicalValue,
        currentFxRate,
        historicalFxRate,
        unrealizedGainLoss,
        gainLossPercentage: historicalValue !== 0
            ? roundToPrecision((unrealizedGainLoss / historicalValue) * 100, 4)
            : 0,
        isGain: unrealizedGainLoss > 0,
        isLoss: unrealizedGainLoss < 0
    };
};

/**
 * Calculate realized FX gain/loss on settlement
 */
export const calculateRealizedFxGainLoss = (
    originalAmount, settlementAmount, acquisitionFxRate, settlementFxRate
) => {
    const acquisitionValueInBase = convertCurrency(originalAmount, acquisitionFxRate);
    const settlementValueInBase = convertCurrency(settlementAmount, settlementFxRate);
    const realizedGainLoss = settlementValueInBase - acquisitionValueInBase;

    return {
        originalAmount,
        settlementAmount,
        acquisitionValueInBase,
        settlementValueInBase,
        realizedGainLoss,
        gainLossPercentage: acquisitionValueInBase !== 0
            ? roundToPrecision((realizedGainLoss / acquisitionValueInBase) * 100, 4)
            : 0
    };
};

/**
 * Verify double-entry balance (debits === credits)
 */
export const verifyDoubleEntryBalance = (entries) => {
    let totalDebits = 0;
    let totalCredits = 0;

    for (const entry of entries) {
        const amount = parseFloat(entry.amount || 0);
        if (entry.entryType === 'debit') {
            totalDebits += amount;
        } else if (entry.entryType === 'credit') {
            totalCredits += amount;
        }
    }

    totalDebits = roundToPrecision(totalDebits, 2);
    totalCredits = roundToPrecision(totalCredits, 2);
    const difference = roundToPrecision(totalDebits - totalCredits, 2);

    return {
        totalDebits,
        totalCredits,
        difference,
        isBalanced: Math.abs(difference) < 0.01
    };
};

/**
 * Calculate account balance from ledger entries
 */
export const calculateAccountBalance = (entries, normalBalance) => {
    let balance = 0;

    for (const entry of entries) {
        const amount = parseFloat(entry.amount || 0);

        if (normalBalance === 'debit') {
            balance += entry.entryType === 'debit' ? amount : -amount;
        } else {
            balance += entry.entryType === 'credit' ? amount : -amount;
        }
    }

    return roundToPrecision(balance, 2);
};

/**
 * Calculate trial balance
 */
export const calculateTrialBalance = (accounts) => {
    let totalDebits = 0;
    let totalCredits = 0;
    const accountBalances = [];

    for (const account of accounts) {
        const balance = calculateAccountBalance(account.entries || [], account.normalBalance);
        const absBalance = Math.abs(balance);

        accountBalances.push({
            accountId: account.id,
            accountCode: account.accountCode,
            accountName: account.accountName,
            balance: absBalance,
            normalBalance: account.normalBalance
        });

        if (account.normalBalance === 'debit' && balance >= 0) {
            totalDebits += absBalance;
        } else if (account.normalBalance === 'credit' && balance >= 0) {
            totalCredits += absBalance;
        }
    }

    return {
        totalDebits: roundToPrecision(totalDebits, 2),
        totalCredits: roundToPrecision(totalCredits, 2),
        difference: roundToPrecision(totalDebits - totalCredits, 2),
        isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
        accountBalances
    };
};

/**
 * Calculate net worth from account balances
 */
export const calculateNetWorth = (accountBalances) => {
    const { assets = 0, liabilities = 0 } = accountBalances;
    return roundToPrecision(assets - liabilities, 2);
};

/**
 * Calculate FX revaluation delta
 */
export const calculateFxRevaluationDelta = (currentSnapshots, previousSnapshots) => {
    const currentMap = new Map(currentSnapshots.map(s => [s.accountId, s]));
    const previousMap = new Map(previousSnapshots.map(s => [s.accountId, s]));

    let totalDelta = 0;

    for (const [accountId, current] of currentMap) {
        const previous = previousMap.get(accountId);
        const previousGainLoss = previous ? parseFloat(previous.unrealizedGainLoss || 0) : 0;
        const currentGainLoss = parseFloat(current.unrealizedGainLoss || 0);
        totalDelta += currentGainLoss - previousGainLoss;
    }

    return roundToPrecision(totalDelta, 2);
};

/**
 * Aggregate balances by account type
 */
export const aggregateBalancesByType = (accounts) => {
    const aggregated = {
        assets: 0,
        liabilities: 0,
        equity: 0,
        revenue: 0,
        expenses: 0
    };

    for (const account of accounts) {
        const balance = parseFloat(account.balance || 0);
        const type = account.accountType.toLowerCase();

        if (aggregated.hasOwnProperty(type)) {
            aggregated[type] += balance;
        }
    }

    for (const key in aggregated) {
        aggregated[key] = roundToPrecision(aggregated[key], 2);
    }

    return aggregated;
};

/**
 * Calculate Pearson Correlation Coefficient (L3)
 * Measures statistical relationship between two asset price series.
 */
export const calculatePearsonCorrelation = (seriesX, seriesY) => {
    if (seriesX.length !== seriesY.length || seriesX.length === 0) return 0;

    const n = seriesX.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (let i = 0; i < n; i++) {
        const x = parseFloat(seriesX[i]);
        const y = parseFloat(seriesY[i]);
        sumX += x;
        sumY += y;
        sumXY += (x * y);
        sumX2 += (x * x);
        sumY2 += (y * y);
    }

    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt((n * sumX2 - Math.pow(sumX, 2)) * (n * sumY2 - Math.pow(sumY, 2)));

    if (denominator === 0) return 0;
    return roundToPrecision(numerator / denominator, 4);
};

/**
 * Calculate Beta of an asset relative to a benchmark (L3)
 * Beta = Covariance(Asset, Benchmark) / Variance(Benchmark)
 */
export const calculateBeta = (assetReturns, benchmarkReturns) => {
    if (assetReturns.length !== benchmarkReturns.length || assetReturns.length === 0) return 1.0;

    const n = assetReturns.length;
    const avgAsset = assetReturns.reduce((a, b) => a + parseFloat(b), 0) / n;
    const avgBenchmark = benchmarkReturns.reduce((a, b) => a + parseFloat(b), 0) / n;

    let covariance = 0;
    let variance = 0;

    for (let i = 0; i < n; i++) {
        const assetDiff = parseFloat(assetReturns[i]) - avgAsset;
        const benchmarkDiff = parseFloat(benchmarkReturns[i]) - avgBenchmark;
        covariance += (assetDiff * benchmarkDiff);
        variance += Math.pow(benchmarkDiff, 2);
    }

    if (variance === 0) return 1.0;
    return roundToPrecision(covariance / variance, 4);
};

/**
 * Calculate Logistic Probability of Default (#441)
 * @param {number} incomeVelocity - Monthly income / Monthly debt
 * @param {number} liquidityRatio - Total assets / Total debt
 * @param {number} macroRiskFactor - Adjusted for interest rate hikes
 */
export const calculateLogisticDefaultProbability = (incomeVelocity, liquidityRatio, macroRiskFactor) => {
    // Coefficients derived from simulated historical defaults
    const b0 = 1.5;   // Intercept
    const b1 = -2.2;  // Higher income velocity reduces default
    const b2 = -1.8;  // Higher liquidity reduces default
    const b3 = 0.8;   // Higher macro risk (rates) increases default

    const z = b0 + (b1 * incomeVelocity) + (b2 * liquidityRatio) + (b3 * macroRiskFactor);

    // Logistic function: 1 / (1 + e^-z)
    const probability = 1 / (1 + Math.exp(-z));
    return Math.min(Math.max(probability, 0), 1);
};

/**
 * Calculate Stress Test Survival Horizon (in days) (#441)
 * Determines how long a user survives if all income stops.
 */
export const calculateSurvivalHorizon = (liquidAssets, monthlyFixedExpenses, macroVolatility) => {
    if (monthlyFixedExpenses <= 0) return 3650; // Nearly infinite

    const dailyBurn = (monthlyFixedExpenses / 30) * (1 + macroVolatility);
    const horizon = liquidAssets / dailyBurn;

    return Math.floor(horizon);
};
