/**
 * Tax Math Utilities (#448)
 * Handles queue sorting and basis recalculation for multi-lot accounting.
 */

/**
 * Sort lots based on chosen liquidation method
 * @param {Array} lots - Array of tax lot objects
 * @param {string} method - 'FIFO', 'LIFO', 'HIFO'
 * @returns {Array} Sorted lots
 */
export const sortLotsForLiquidation = (lots, method = 'HIFO') => {
    const sorted = [...lots];

    switch (method.toUpperCase()) {
        case 'FIFO':
            // First-In, First-Out: Sort by purchase date ascending
            return sorted.sort((a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate));

        case 'LIFO':
            // Last-In, First-Out: Sort by purchase date descending
            return sorted.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate));

        case 'HIFO':
            // Highest-In, First-Out: Sort by cost basis descending
            return sorted.sort((a, b) => parseFloat(b.costBasisPerUnit) - parseFloat(a.costBasisPerUnit));

        default:
            return sorted;
    }
};

/**
 * Calculate Adjusted Cost Basis
 * @param {number} originalBasis 
 * @param {Array} adjustments - Array of adjustment amounts
 */
export const calculateAdjustedBasis = (originalBasis, adjustments = []) => {
    const totalAdjustment = adjustments.reduce((sum, adj) => sum + parseFloat(adj), 0);
    return parseFloat(originalBasis) + totalAdjustment;
};

/**
 * Calculate Capital Gain/Loss for a disposal
 * @param {number} proceeds - Sale price * quantity sold
 * @param {number} costBasis - Adjusted cost basis * quantity sold
 */
export const calculateCapitalGain = (proceeds, costBasis) => {
    return parseFloat(proceeds) - parseFloat(costBasis);
};

/**
 * Determine holding period type
 * @param {Date} purchaseDate 
 * @param {Date} disposalDate 
 */
export const getHoldingPeriodType = (purchaseDate, disposalDate = new Date()) => {
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    const diff = new Date(disposalDate) - new Date(purchaseDate);
    return diff > oneYear ? 'long_term' : 'short_term';
};
