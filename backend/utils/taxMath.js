/**
 * Tax Math Utilities (#448 + #460)
 * Handles queue sorting, basis recalculation, wash-sale disallowance,
 * jurisdiction-aware tax rates, and harvest benefit calculations.
 */

/**
 * Sort lots based on chosen liquidation method
 * @param {Array} lots - Array of tax lot objects
 * @param {string} method - 'FIFO', 'LIFO', 'HIFO', 'SpecificID'
 * @returns {Array} Sorted lots
 */
export const sortLotsForLiquidation = (lots, method = 'HIFO') => {
    const sorted = [...lots];

    switch (method.toUpperCase()) {
        case 'FIFO':
            return sorted.sort((a, b) =>
                new Date(a.purchaseDate ?? a.acquisitionDate) -
                new Date(b.purchaseDate ?? b.acquisitionDate)
            );
        case 'LIFO':
            return sorted.sort((a, b) =>
                new Date(b.purchaseDate ?? b.acquisitionDate) -
                new Date(a.purchaseDate ?? a.acquisitionDate)
            );
        case 'HIFO':
            return sorted.sort((a, b) =>
                parseFloat(b.costBasisPerUnit ?? b.unitPrice) -
                parseFloat(a.costBasisPerUnit ?? a.unitPrice)
            );
        default:
            return sorted;
    }
};

/**
 * Calculate Adjusted Cost Basis
 */
export const calculateAdjustedBasis = (originalBasis, adjustments = []) => {
    const totalAdjustment = adjustments.reduce((sum, adj) => sum + parseFloat(adj), 0);
    return parseFloat(originalBasis) + totalAdjustment;
};

/**
 * Calculate Capital Gain/Loss for a disposal
 */
export const calculateCapitalGain = (proceeds, costBasis) => {
    return parseFloat(proceeds) - parseFloat(costBasis);
};

/**
 * Determine holding period type (original simple version kept for compatibility)
 */
export const getHoldingPeriodType = (purchaseDate, disposalDate = new Date()) => {
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    const diff = new Date(disposalDate) - new Date(purchaseDate);
    return diff > oneYear ? 'long_term' : 'short_term';
};

// ─── Feature #460: Global Multi-Jurisdictional Wash-Sale Shield Extensions ────

/**
 * Calendar days between two dates
 */
export const getDaysHeld = (purchaseDate, saleDate = new Date()) =>
    Math.floor((new Date(saleDate) - new Date(purchaseDate)) / (1000 * 60 * 60 * 24));

/**
 * Jurisdiction-aware capital gains tax rate table.
 * Rates are approximate statutory maximums.
 */
const TAX_RATES = {
    US: { short_term: 0.37, long_term: 0.20 },
    EU: { short_term: 0.30, long_term: 0.265 },
    APAC: { short_term: 0.30, long_term: 0.15 },
    IN: { short_term: 0.15, long_term: 0.10 },
    SG: { short_term: 0.00, long_term: 0.00 },
    AE: { short_term: 0.00, long_term: 0.00 },
};

export const getEffectiveTaxRate = (jurisdiction = 'US', holdingPeriodType = 'short_term') => {
    const rates = TAX_RATES[jurisdiction] ?? TAX_RATES.US;
    return rates[holdingPeriodType] ?? rates.short_term;
};

/**
 * Check if a repurchase falls within the 30-day wash-sale window (IRS §1091)
 */
export const isWithinWashSaleWindow = (saleDate, repurchaseDate) =>
    Math.abs(getDaysHeld(saleDate, repurchaseDate)) <= 30;

/**
 * Compute wash-sale disallowance amounts.
 * The disallowed amount is deferred and added to the replacement lot's cost basis.
 *
 * @param {number} realizedLoss   - Negative number representing the loss
 * @param {number} quantitySold   - Units sold in the loss transaction
 * @param {number} replacementQty - Units repurchased within the 30-day window
 */
export const computeWashSaleDisallowance = (realizedLoss, quantitySold, replacementQty) => {
    if (realizedLoss >= 0) return { disallowedAmount: 0, allowedAmount: 0, basisAdjustment: 0 };

    const absLoss = Math.abs(realizedLoss);
    const washRatio = Math.min(replacementQty / quantitySold, 1);
    const disallowedAmount = parseFloat((absLoss * washRatio).toFixed(4));
    const allowedAmount = parseFloat((absLoss * (1 - washRatio)).toFixed(4));

    return { disallowedAmount, allowedAmount, basisAdjustment: disallowedAmount };
};

/**
 * Unrealized G/L for an open lot at current market price
 */
export const calculateUnrealizedGL = (lot, currentMarketPrice) => {
    const costPerUnit = parseFloat(lot.costBasisPerUnit ?? lot.purchasePrice ?? lot.unitPrice);
    const qty = parseFloat(lot.remainingQuantity ?? lot.quantity);
    const marketValue = parseFloat(currentMarketPrice) * qty;
    const costBasisTotal = costPerUnit * qty;
    const unrealizedGL = marketValue - costBasisTotal;

    return {
        unrealizedGL: parseFloat(unrealizedGL.toFixed(4)),
        marketValue: parseFloat(marketValue.toFixed(4)),
        costBasisTotal: parseFloat(costBasisTotal.toFixed(4)),
        isLoss: unrealizedGL < 0,
        glPercent: costBasisTotal > 0
            ? parseFloat(((unrealizedGL / costBasisTotal) * 100).toFixed(2))
            : 0,
    };
};

/**
 * Net benefit of harvesting a loss after trading costs and tax savings.
 * Accounts for slippage, commissions, and jurisdiction-specific tax rates.
 */
export const calculateNetHarvestBenefit = (lossAmount, jurisdiction = 'US', holdingPeriodType = 'short_term', options = {}) => {
    const { slippageRate = 0.002, commission = 10, taxRateOverride = null } = options;
    const taxRate = taxRateOverride ?? getEffectiveTaxRate(jurisdiction, holdingPeriodType);
    const absLoss = Math.abs(lossAmount);
    const taxSavings = absLoss * taxRate;
    const slippageCost = absLoss * slippageRate;
    const totalCosts = slippageCost + commission;
    const netBenefit = taxSavings - totalCosts;

    return {
        lossAmount: absLoss,
        taxRate,
        taxSavings: parseFloat(taxSavings.toFixed(4)),
        slippageCost: parseFloat(slippageCost.toFixed(4)),
        commission,
        totalCosts: parseFloat(totalCosts.toFixed(4)),
        netBenefit: parseFloat(netBenefit.toFixed(4)),
        isWorthwhile: netBenefit > 0,
        minimumThreshold: parseFloat((totalCosts / taxRate).toFixed(4)),
    };
};

/**
 * Lot discrepancy report: identify lots with unrealised G/L exceeding a threshold.
 * Used by the lotReconciliation job to surface harvesting candidates.
 *
 * @param {Array}  lots            - Open lot objects with cost basis fields
 * @param {number} marketPrice     - Current market price of the asset
 * @param {number} thresholdPercent - Minimum |% G/L| to flag (default 5%)
 */
export const findLotDiscrepancies = (lots, marketPrice, thresholdPercent = 5) =>
    lots
        .map(lot => ({ ...lot, ...calculateUnrealizedGL(lot, marketPrice) }))
        .filter(lot => Math.abs(lot.glPercent) >= thresholdPercent)
        .sort((a, b) => a.unrealizedGL - b.unrealizedGL); // Worst losses first
